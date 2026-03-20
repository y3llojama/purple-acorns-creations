import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import crypto from 'crypto'

const rateLimitMap = new Map<string, { count: number; windowStart: number }>()
const RATE_LIMIT_MAX = 100
const RATE_LIMIT_WINDOW = 60_000

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (entry && now - entry.windowStart < RATE_LIMIT_WINDOW) {
    if (entry.count >= RATE_LIMIT_MAX) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
    }
    entry.count++
  } else {
    rateLimitMap.set(ip, { count: 1, windowStart: now })
  }

  // HMAC signature validation
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
  if (webhookSecret) {
    const signature = request.headers.get('resend-signature') ?? ''
    const rawBody = await request.text()
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex')
    let valid = false
    try {
      valid = crypto.timingSafeEqual(
        Buffer.from(signature, 'utf8'),
        Buffer.from(expected, 'utf8')
      )
    } catch {
      valid = false
    }
    if (!valid) return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 })

    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }
    return handleEvent(body)
  }

  // No webhook secret configured (dev) — parse body directly
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body.' }, { status: 400 })
  return handleEvent(body)
}

async function handleEvent(body: Record<string, unknown>) {
  const type = body.type as string
  const data = (body.data ?? {}) as Record<string, unknown>
  const emailId = data.email_id as string | undefined

  if (!emailId) return NextResponse.json({ error: 'Missing email_id.' }, { status: 400 })

  const supabase = createServiceRoleClient()

  if (type === 'email.opened') {
    const { error } = await supabase
      .from('newsletter_send_log')
      .update({ opened_at: new Date().toISOString() })
      .eq('resend_message_id', emailId)
    if (error) {
      console.error('[webhook] opened update failed:', error.message)
      return NextResponse.json({ error: 'DB error.' }, { status: 500 })
    }
  } else if (type === 'email.clicked') {
    const { error } = await supabase
      .from('newsletter_send_log')
      .update({ clicked_at: new Date().toISOString() })
      .eq('resend_message_id', emailId)
    if (error) {
      console.error('[webhook] clicked update failed:', error.message)
      return NextResponse.json({ error: 'DB error.' }, { status: 500 })
    }
  } else if (type === 'email.bounced') {
    const email = data.to as string | undefined
    const { error: logError } = await supabase
      .from('newsletter_send_log')
      .update({ status: 'bounced' })
      .eq('resend_message_id', emailId)
    if (logError) console.error('[webhook] bounce log update failed:', logError.message)
    if (email) {
      const { error: subError } = await supabase
        .from('newsletter_subscribers')
        .update({ status: 'bounced' })
        .eq('email', email)
      if (subError) console.error('[webhook] subscriber bounce update failed:', subError.message)
    }
  }

  return NextResponse.json({ ok: true })
}
