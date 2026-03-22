import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { decryptSettings } from '@/lib/crypto'
import { isValidHttpsUrl, clampLength } from '@/lib/validate'
import { sanitizeText } from '@/lib/sanitize'

// Vercel: allow up to 60s for search + AI response
export const maxDuration = 60

interface DiscoveredEvent {
  name: string
  date: string
  location: string
  link_url?: string
}

interface SearchResult {
  title: string
  url: string
  description?: string
}

const SEARCH_QUERIES = [
  '"purple acornz creations" events Massachusetts',
  '"purple acornz" craft fair MA OR NH OR RI',
  '"purple acornz creations" market vendor',
]

async function tavilySearch(apiKey: string, query: string): Promise<SearchResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      max_results: 10,
      days: 365,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Tavily Search error ${res.status}: ${body.slice(0, 200)}`)
  }

  const data = await res.json()
  return (data?.results ?? []).map((r: { title: string; url: string; content?: string }) => ({
    title: r.title,
    url: r.url,
    description: r.content,
  }))
}

async function callAiProvider(provider: string, apiKey: string, prompt: string): Promise<string> {
  if (provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 200)}`)
    }
    const data = await res.json()
    return data.content?.[0]?.text ?? ''
  }

  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`OpenAI API error ${res.status}: ${body.slice(0, 200)}`)
    }
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? ''
  }

  if (provider === 'groq') {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Groq API error ${res.status}: ${body.slice(0, 200)}`)
    }
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? ''
  }

  throw new Error(`Unsupported AI provider: ${provider}`)
}

export async function POST() {
  const { error } = await requireAdminSession()
  if (error) return error

  const supabase = createServiceRoleClient()

  const { data: settingsRow } = await supabase
    .from('settings')
    .select('search_api_key, ai_provider, ai_api_key')
    .single()

  const settings = settingsRow ? decryptSettings(settingsRow) : null
  const searchApiKey = process.env.SEARCH_API_KEY ?? settings?.search_api_key
  const aiProvider = settings?.ai_provider
  const aiApiKey = process.env.AI_API_KEY ?? settings?.ai_api_key

  if (!searchApiKey) {
    return NextResponse.json(
      { error: 'Brave Search API key not configured. Add it in Admin → Integrations.' },
      { status: 503 }
    )
  }

  if (!aiProvider || !aiApiKey) {
    return NextResponse.json(
      { error: 'AI provider not configured. Set AI provider and key in Admin → Integrations.' },
      { status: 503 }
    )
  }

  // Fire all 3 search queries in parallel
  let allResults: SearchResult[]
  try {
    const resultSets = await Promise.all(
      SEARCH_QUERIES.map(q => tavilySearch(searchApiKey, q))
    )
    // Combine and dedup by URL
    const seen = new Set<string>()
    allResults = []
    for (const results of resultSets) {
      for (const r of results) {
        if (!seen.has(r.url)) {
          seen.add(r.url)
          allResults.push(r)
        }
      }
    }
  } catch (err) {
    console.error('[discover] Brave Search failed:', err)
    return NextResponse.json({ error: 'Search failed. Please try again.' }, { status: 502 })
  }

  if (allResults.length === 0) {
    return NextResponse.json({ added: 0, skipped: 0 })
  }

  // Build AI extraction prompt
  const today = new Date().toISOString().slice(0, 10)
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const snippets = allResults
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.description ?? ''}`)
    .join('\n\n')

  const prompt = `Today is ${today}. You are extracting craft fair and market events for "Purple Acorns Creations" (also spelled "Purple Acornz"), a Massachusetts-based handmade jewelry and crochet accessories vendor.

Below are web search results. Extract all events where Purple Acorns Creations appeared or is scheduled to appear as a vendor. Only include events in Massachusetts, New Hampshire, or Rhode Island. Only include events between ${oneYearAgo} and one year from today.

Search results:
${snippets}

Return ONLY a valid JSON array — no prose, no markdown, no code fences:
[{"name": "event name", "date": "YYYY-MM-DD", "location": "venue or city, state", "link_url": "https://..."}]

Rules:
- Only include events you can extract a specific date for (YYYY-MM-DD format).
- Use the URL from the search result as link_url when relevant.
- If you cannot determine a date, omit the event entirely.
- If no events found, return an empty array: []`

  let rawText: string
  try {
    rawText = await callAiProvider(aiProvider, aiApiKey, prompt)
  } catch (err) {
    console.error('[discover] AI extraction failed:', err)
    return NextResponse.json({ error: 'Event extraction failed. Please try again.' }, { status: 502 })
  }

  // Extract JSON array — find first [ to last ]
  let foundEvents: DiscoveredEvent[]
  try {
    const start = rawText.indexOf('[')
    const end = rawText.lastIndexOf(']')
    if (start === -1 || end === -1 || end <= start) {
      return NextResponse.json({ added: 0, skipped: 0 })
    }
    foundEvents = JSON.parse(rawText.slice(start, end + 1))
    if (!Array.isArray(foundEvents)) throw new Error('Not an array')
  } catch (err) {
    console.error('[discover] JSON parse error:', err, 'raw:', rawText.slice(0, 500))
    return NextResponse.json({ error: 'Discovery failed. Please try again.' }, { status: 502 })
  }

  if (foundEvents.length === 0) {
    return NextResponse.json({ added: 0, skipped: 0 })
  }

  let added = 0
  let skipped = 0

  for (const ev of foundEvents) {
    if (
      typeof ev.name !== 'string' || !ev.name.trim() ||
      typeof ev.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date) ||
      typeof ev.location !== 'string' || !ev.location.trim()
    ) {
      continue
    }

    const name = sanitizeText(clampLength(ev.name.trim(), 200))
    const location = sanitizeText(clampLength(ev.location.trim(), 300))
    const date = ev.date
    const link_url = ev.link_url && isValidHttpsUrl(ev.link_url) ? ev.link_url : null

    const { data: existing } = await supabase
      .from('events')
      .select('id')
      .ilike('name', name)
      .eq('date', date)
      .ilike('location', location)
      .single()

    if (existing) {
      skipped++
      continue
    }

    const { error: insertError } = await supabase.from('events').insert({ name, date, location, link_url })
    if (insertError) {
      console.error('[discover] insert error:', insertError)
      continue
    }
    added++
  }

  return NextResponse.json({ added, skipped })
}
