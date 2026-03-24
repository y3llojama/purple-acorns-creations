import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import crypto from 'crypto'
import { getClientIp } from '@/lib/get-client-ip'

const rateLimitMap = new Map<string, { count: number; reset: number }>()
const RATE_LIMIT_MAX = 100
const RATE_LIMIT_WINDOW = 60_000

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const now = Date.now()
  const entry = rateLimitMap.get(ip) ?? { count: 0, reset: now + RATE_LIMIT_WINDOW }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + RATE_LIMIT_WINDOW }
  entry.count++; rateLimitMap.set(ip, entry)
  if (entry.count > RATE_LIMIT_MAX) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  // HMAC signature validation — required, no unauthenticated fallback
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[newsletter-webhook] RESEND_WEBHOOK_SECRET is not configured — rejecting all requests')
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 500 })
  }

  // Resend delivers webhooks via Svix — use separate svix-id, svix-timestamp, svix-signature headers
  // Secret format: "whsec_<base64>" — base64-decode the payload portion before use
  // Signed payload: "{svix-id}.{svix-timestamp}.{rawBody}"
  // Comparison is base64 vs base64 (not hex) — matches Svix's signing scheme
  const svixId = request.headers.get('svix-id') ?? ''
  const svixTimestamp = request.headers.get('svix-timestamp') ?? ''
  const svixSignature = request.headers.get('svix-signature') ?? ''
  const rawBody = await request.text()

  let valid = false
  if (svixId && svixTimestamp && svixSignature) {
    try {
      const secretBytes = Buffer.from(webhookSecret.replace(/^whsec_/, ''), 'base64')
      const toSign = `${svixId}.${svixTimestamp}.${rawBody}`
      const expected = crypto.createHmac('sha256', secretBytes).update(toSign).digest('base64')
      // svix-signature may contain multiple space-separated "v1,<base64>" entries
      const sigs = svixSignature.split(' ')
      for (const sig of sigs) {
        const [version, b64] = sig.split(',', 2)
        if (version !== 'v1' || !b64) continue
        const a = Buffer.from(b64, 'base64')
        const b = Buffer.from(expected, 'base64')
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) { valid = true; break }
      }
    } catch {
      valid = false
    }
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
