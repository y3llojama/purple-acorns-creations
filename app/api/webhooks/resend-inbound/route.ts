import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { sanitizeText } from '@/lib/sanitize'
import { clampLength } from '@/lib/validate'
import { decryptSettings } from '@/lib/crypto'
import { parseFromEmail, verifyInboundHmac } from './helpers'

async function uploadInboundAttachments(
  attachments: Array<{ filename?: string; content_type?: string; data?: string }> | null | undefined
): Promise<string[]> {
  if (!attachments || attachments.length === 0) return []
  const supabase = createServiceRoleClient()
  const urls: string[] = []

  for (const att of attachments.slice(0, 5)) {
    // Skip non-images or malformed entries
    if (!att.content_type?.startsWith('image/') || !att.data) continue
    try {
      const buffer = Buffer.from(att.data, 'base64')
      const ext = att.content_type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg'
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage
        .from('messages')
        .upload(path, buffer, { contentType: att.content_type })
      if (error) continue
      const { data } = supabase.storage.from('messages').getPublicUrl(path)
      urls.push(data.publicUrl)
    } catch {
      // skip malformed attachment silently
    }
  }
  return urls
}

// In-memory rate limiter: 60 requests per IP per 60 seconds
const rateLimitMap = new Map<string, { count: number; reset: number }>()

export async function POST(request: Request) {
  const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
  const now = Date.now()
  const entry = rateLimitMap.get(ip) ?? { count: 0, reset: now + 60_000 }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000 }
  entry.count++; rateLimitMap.set(ip, entry)
  if (entry.count > 60) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('[inbound] RESEND_WEBHOOK_SECRET not configured — rejecting all requests')
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 500 })
  }

  const rawBody = await request.text()
  const svixId = request.headers.get('svix-id') ?? ''
  const svixTimestamp = request.headers.get('svix-timestamp') ?? ''
  const svixSignature = request.headers.get('svix-signature') ?? ''
  if (!verifyInboundHmac(webhookSecret, svixId, svixTimestamp, svixSignature, rawBody)) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 })
  }

  let payload: { type: string; data: Record<string, unknown> }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  if (payload.type !== 'email.received') {
    // Ignore other event types that may be routed here
    return NextResponse.json({ ok: true })
  }

  // Webhook payload: { type, data: { email_id, from, to, subject, ... } }
  // Body and headers are NOT in the webhook — must fetch separately via Resend API.
  const emailId = String(payload.data.email_id ?? '')
  const fromRaw = String(payload.data.from ?? '')

  if (!emailId) return NextResponse.json({ error: 'Missing email_id.' }, { status: 400 })

  const fromEmail = parseFromEmail(fromRaw)
  if (!fromEmail) {
    console.log('[inbound] unparseable from address:', fromRaw)
    return NextResponse.json({ ok: true })
  }

  // Fetch Resend API key from encrypted settings
  const supabase = createServiceRoleClient()
  const { data: settings } = await supabase
    .from('settings')
    .select('resend_api_key')
    .single()
  const decrypted = settings ? decryptSettings(settings) : null

  if (!decrypted?.resend_api_key) {
    console.error('[inbound] Resend API key not configured')
    return NextResponse.json({ ok: true })
  }

  // Fetch full email content (text + headers) — not included in webhook payload
  const resend = new Resend(decrypted.resend_api_key)
  const { data: fullEmail, error: fetchError } = await resend.emails.receiving.get(emailId)

  if (fetchError || !fullEmail) {
    console.error('[inbound] failed to fetch email content:', fetchError)
    return NextResponse.json({ ok: true })
  }

  const text = sanitizeText(clampLength(String(fullEmail.text ?? ''), 50_000))
  const headers = (fullEmail.headers ?? {}) as Record<string, string>
  // Check both casing variants — email header names are case-insensitive
  const inReplyToRaw = headers['in-reply-to'] ?? headers['In-Reply-To'] ?? ''
  const inReplyTo = inReplyToRaw.replace(/[<>]/g, '').trim()

  let messageId: string | null = null

  // 1. Match by In-Reply-To header → stored resend_message_id
  if (inReplyTo) {
    const { data } = await supabase
      .from('message_replies')
      .select('message_id')
      .eq('resend_message_id', inReplyTo)
      .limit(1)
      .single()
    messageId = data?.message_id ?? null
  }

  // 2. Fallback: match by sender email address → most recent message from that address
  if (!messageId) {
    const { data } = await supabase
      .from('messages')
      .select('id')
      .eq('email', fromEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    messageId = data?.id ?? null
  }

  if (!messageId) {
    console.log('[inbound] unmatched email from', fromEmail)
    return NextResponse.json({ ok: true })
  }

  // Parse and upload any image attachments from the email
  const attachmentUrls = await uploadInboundAttachments(
    (fullEmail as Record<string, unknown>).attachments as
      Array<{ filename?: string; content_type?: string; data?: string }> | undefined
  )

  await supabase
    .from('message_replies')
    .insert({ message_id: messageId, body: text, direction: 'inbound', from_email: fromEmail, attachments: attachmentUrls })

  await supabase.from('messages').update({ is_read: false }).eq('id', messageId)

  return NextResponse.json({ ok: true })
}
