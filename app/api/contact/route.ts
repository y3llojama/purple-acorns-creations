import { NextResponse } from 'next/server'
import { isValidEmail, clampLength } from '@/lib/validate'
import { sanitizeText } from '@/lib/sanitize'

// Rate limiter: 1 submission per IP per 60 seconds
const rateLimitMap = new Map<string, number>()

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
  const now = Date.now()
  if ((rateLimitMap.get(ip) ?? 0) + 60_000 > now) {
    return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429 })
  }
  rateLimitMap.set(ip, now)

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const name = sanitizeText(clampLength(String(body.name ?? ''), 100))
  const email = sanitizeText(String(body.email ?? '').trim().toLowerCase())
  const message = sanitizeText(clampLength(String(body.message ?? ''), 2000))

  if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
  if (!isValidEmail(email)) return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 })

  const { createServiceRoleClient } = await import('@/lib/supabase/server')
  const supabase = createServiceRoleClient()
  const { data: settings } = await supabase.from('settings').select('contact_email').single()

  if (!settings?.contact_email) {
    // Silently succeed if no contact email configured (don't expose config state)
    return NextResponse.json({ success: true })
  }

  // In production: integrate with Resend/Postmark/etc. for actual email delivery
  // For now: log server-side (replace with actual send before launch)
  console.log(`[Contact] From: ${name} <${email}> | To: ${settings.contact_email} | Message: ${message}`)

  return NextResponse.json({ success: true })
}
