import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { decryptSettings } from '@/lib/crypto'
import { isValidHttpsUrl, clampLength } from '@/lib/validate'
import { sanitizeText } from '@/lib/sanitize'

// Vercel: allow up to 60s for AI response
export const maxDuration = 60

interface DiscoveredEvent {
  name: string
  date: string
  location: string
  link_url?: string
}

const PROMPT = `Search your knowledge for craft fair, market, and pop-up shop events that a Brooklyn-based handmade jewelry and crochet accessories vendor called "Purple Acorns Creations" (also spelled "Purple Acornz") has appeared at or is scheduled to appear at. These events are typically in Brooklyn, NYC, and the surrounding area.

Return ONLY a valid JSON array with this exact shape — no prose, no markdown, no code fences:
[{"name": "event name", "date": "YYYY-MM-DD", "location": "venue or neighborhood", "link_url": "https://..."}]

Rules:
- Only include events you are confident about.
- If you cannot find a reliable link, omit link_url entirely.
- If you have no information, return an empty array: []`

export async function POST() {
  const { error } = await requireAdminSession()
  if (error) return error

  const supabase = createServiceRoleClient()

  const { data: settingsRow } = await supabase
    .from('settings')
    .select('ai_provider, ai_api_key')
    .single()

  const settings = settingsRow ? decryptSettings(settingsRow) : null
  const aiProvider = settings?.ai_provider
  const aiApiKey = process.env.AI_API_KEY ?? settings?.ai_api_key

  if (!aiProvider || !aiApiKey) {
    return NextResponse.json(
      { error: 'AI is not configured. Set ai_provider and AI_API_KEY in Admin → Integrations.' },
      { status: 503 }
    )
  }

  let rawText: string
  try {
    rawText = await callAiProvider(aiProvider, aiApiKey, PROMPT)
  } catch (err) {
    console.error('[discover] AI call failed:', err)
    return NextResponse.json({ error: 'Discovery failed. Please try again.' }, { status: 502 })
  }

  if (!rawText.trim()) {
    return NextResponse.json({ added: 0, skipped: 0 })
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
