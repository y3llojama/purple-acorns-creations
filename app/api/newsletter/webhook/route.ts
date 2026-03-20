import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import crypto from 'crypto'

const rateLimitMap = new Map<string, number>()

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
  const now = Date.now()
  if (now - (rateLimitMap.get(ip) ?? 0) < 60_000) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }
  rateLimitMap.set(ip, now)

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

    const body = JSON.parse(rawBody)
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
    await supabase
      .from('newsletter_send_log')
      .update({ opened_at: new Date().toISOString() })
      .eq('resend_message_id', emailId)
  } else if (type === 'email.clicked') {
    await supabase
      .from('newsletter_send_log')
      .update({ clicked_at: new Date().toISOString() })
      .eq('resend_message_id', emailId)
  } else if (type === 'email.bounced') {
    const email = data.to as string | undefined
    await supabase
      .from('newsletter_send_log')
      .update({ status: 'bounced' })
      .eq('resend_message_id', emailId)
    if (email) {
      await supabase
        .from('newsletter_subscribers')
        .update({ status: 'bounced' })
        .eq('email', email)
    }
  }

  return NextResponse.json({ ok: true })
}
