import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { buildAiPrompt, isValidNewsletterSection } from '@/lib/newsletter'
import { sanitizeContent } from '@/lib/sanitize'
import type { NewsletterSection } from '@/lib/supabase/types'
import { decryptSettings } from '@/lib/crypto'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: RouteContext) {
  const { error } = await requireAdminSession()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const { workingOn = '', selectedChips = [], tone = 'upbeat', extra = '' } = body as {
    workingOn?: string; selectedChips?: string[]; tone?: string; extra?: string
  }

  const { id } = await params
  const supabase = createServiceRoleClient()
  const today = new Date().toISOString().split('T')[0]

  // Parallel fetch: settings + upcoming events
  const [settingsResult, eventsResult] = await Promise.all([
    supabase.from('settings').select('ai_provider, ai_api_key').single(),
    supabase.from('events')
      .select('name, date, location')
      .gte('date', today)
      .order('date', { ascending: true })
      .limit(5),
  ])

  const settings = settingsResult.data ? decryptSettings(settingsResult.data) : null
  // Env var always wins over DB setting
  const aiProvider = settings?.ai_provider
  const aiApiKey = process.env.AI_API_KEY ?? settings?.ai_api_key

  if (!aiProvider || !aiApiKey) {
    return NextResponse.json(
      { error: 'AI is not configured. Set ai_provider and AI_API_KEY in Admin → Integrations.' },
      { status: 503 }
    )
  }

  const upcomingEvents = (eventsResult.data ?? []).map((e) => ({
    name: e.name,
    date: e.date,
    location: e.location,
  }))

  const prompt = buildAiPrompt({
    workingOn,
    selectedChips,
    tone: tone as any,
    extra,
    upcomingEvents,
    today,
  })

  // Call AI provider
  let rawContent: string
  try {
    rawContent = await callAiProvider(aiProvider, aiApiKey, prompt)
  } catch (err) {
    console.error('[generate] AI call failed:', err)
    return NextResponse.json({ error: 'AI generation failed. Please try again.' }, { status: 502 })
  }

  // Strip markdown code fences and parse JSON
  const cleaned = rawContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```\s*$/, '').trim()
  let draft: { title?: string; subject_line?: string; teaser_text?: string; sections?: unknown[] }
  try {
    draft = JSON.parse(cleaned)
  } catch {
    console.error('[generate] Failed to parse AI JSON:', cleaned.slice(0, 200))
    return NextResponse.json({ error: 'AI returned invalid JSON. Try regenerating.' }, { status: 502 })
  }

  // Validate and sanitize AI-generated sections before saving
  const rawSections = (draft.sections ?? []) as unknown[]
  const sections: NewsletterSection[] = rawSections
    .filter(isValidNewsletterSection)
    .map((s) => {
      const section = s as NewsletterSection
      if (section.type === 'text') return { ...section, body: sanitizeContent(section.body) }
      return section
    })

  // Save to newsletter
  const aiBrief = { workingOn, selectedChips, tone, extra }
  const { data: updatedNewsletter, error: updateError } = await supabase
    .from('newsletters')
    .update({
      title: draft.title ?? '',
      subject_line: draft.subject_line ?? '',
      teaser_text: draft.teaser_text ?? '',
      content: sections,
      ai_brief: aiBrief,
    })
    .eq('id', id)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: 'Failed to save newsletter draft. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ draft: updatedNewsletter })
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
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) throw new Error(`Anthropic API error ${res.status}`)
    const data = await res.json()
    return data.content?.[0]?.text ?? ''
  }

  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) throw new Error(`OpenAI API error ${res.status}`)
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? ''
  }

  if (provider === 'groq') {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (!res.ok) throw new Error(`Groq API error ${res.status}`)
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? ''
  }

  throw new Error(`Unknown AI provider: ${provider}`)
}
