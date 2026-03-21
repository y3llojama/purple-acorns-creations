import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { decryptSettings } from '@/lib/crypto'
import { isValidHttpsUrl, clampLength } from '@/lib/validate'
import { sanitizeText } from '@/lib/sanitize'

interface DiscoveredEvent {
  name: string
  date: string
  location: string
  link_url?: string
}

export async function POST() {
  const { error } = await requireAdminSession()
  if (error) return error

  const supabase = createServiceRoleClient()

  // Read AI config from settings table
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

  // Call Claude API with web_search tool
  let result: { content: Array<{ type: string; text?: string }> }
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': aiApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `Search for past and upcoming craft fair or market events that "Purple Acorns Creations" or "Purple Acornz" has appeared at or is scheduled to appear at. Look for events in Brooklyn, NYC, and the surrounding area. Return ONLY a JSON array of event objects with this exact shape: [{"name": "...", "date": "YYYY-MM-DD", "location": "...", "link_url": "https://..."}]. If you cannot find a link, omit link_url. Return only the JSON array, no other text.`,
        }],
      }),
    })

    if (!response.ok) {
      console.error('[discover] Claude API error:', response.status)
      return NextResponse.json({ error: 'Discovery failed. Please try again.' }, { status: 502 })
    }

    result = await response.json()
  } catch (err) {
    console.error('[discover] fetch error:', err)
    return NextResponse.json({ error: 'Discovery failed. Please try again.' }, { status: 502 })
  }

  // Extract text block from Claude response
  const textBlock = result.content?.find(block => block.type === 'text')
  const rawText = textBlock?.text ?? ''

  if (!rawText.trim()) {
    return NextResponse.json({ added: 0, skipped: 0 })
  }

  // Strip markdown code fences and parse JSON
  let foundEvents: DiscoveredEvent[]
  try {
    const stripped = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    foundEvents = JSON.parse(stripped)
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
    // Validate required fields
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

    // Check for duplicate: name + date + location (case-insensitive)
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

    const { error: insertError } = await supabase.from('events').insert({
      name,
      date,
      location,
      link_url,
    })

    if (insertError) {
      console.error('[discover] insert error:', insertError)
      continue
    }

    added++
  }

  return NextResponse.json({ added, skipped })
}
