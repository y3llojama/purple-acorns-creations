import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { decryptSettings } from '@/lib/crypto'
import nodemailer from 'nodemailer'

export async function POST(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const { type } = body as { type?: string }

  if (!['ai', 'resend', 'smtp'].includes(type ?? '')) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const { data: raw } = await supabase
    .from('settings')
    .select('ai_provider, ai_api_key, resend_api_key, smtp_host, smtp_port, smtp_user, smtp_pass, newsletter_from_email, contact_email')
    .single()

  const settings = raw ? decryptSettings(raw) : null

  if (type === 'ai') {
    const provider = settings?.ai_provider
    const apiKey = process.env.AI_API_KEY ?? settings?.ai_api_key
    if (!provider || !apiKey) {
      return NextResponse.json({ error: 'AI provider and API key not configured.' }, { status: 400 })
    }
    try {
      await pingAiProvider(provider, apiKey)
      return NextResponse.json({ success: true, message: `${providerLabel(provider)} API key is valid.` })
    } catch (err) {
      return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 502 })
    }
  }

  if (type === 'resend') {
    const apiKey = settings?.resend_api_key
    if (!apiKey) {
      return NextResponse.json({ error: 'Resend API key not configured.' }, { status: 400 })
    }
    try {
      const res = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.message ?? `Resend API returned ${res.status}`)
      }
      return NextResponse.json({ success: true, message: 'Resend API key is valid.' })
    } catch (err) {
      return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 502 })
    }
  }

  if (type === 'smtp') {
    const host = settings?.smtp_host
    const port = parseInt(settings?.smtp_port ?? '587', 10)
    const user = settings?.smtp_user
    const pass = settings?.smtp_pass
    if (!host || !user || !pass) {
      return NextResponse.json({ error: 'SMTP host, username, and password are required.' }, { status: 400 })
    }
    try {
      const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } })
      await transporter.verify()
      return NextResponse.json({ success: true, message: 'SMTP connection successful.' })
    } catch (err) {
      return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 502 })
    }
  }
}

function providerLabel(provider: string) {
  return { claude: 'Claude (Anthropic)', openai: 'OpenAI', groq: 'Groq' }[provider] ?? provider
}

async function pingAiProvider(provider: string, apiKey: string) {
  if (provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error?.message ?? `Anthropic API returned ${res.status}`)
    }
    return
  }
  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error?.message ?? `OpenAI API returned ${res.status}`)
    }
    return
  }
  if (provider === 'groq') {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data?.error?.message ?? `Groq API returned ${res.status}`)
    }
    return
  }
  throw new Error(`Unknown provider: ${provider}`)
}
