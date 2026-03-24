import { NextResponse } from 'next/server'
import { isValidEmail, clampLength, stripControlChars } from '@/lib/validate'
import { sanitizeText } from '@/lib/sanitize'
import { getClientIp } from '@/lib/get-client-ip'

// Rate limiter: 1 submission per IP per 60 seconds
const rateLimitMap = new Map<string, number>()

// Prune stale entries every 5 minutes to prevent memory leak
const PRUNE_INTERVAL = 5 * 60_000
const RATE_WINDOW = 60_000
let lastPrune = Date.now()

function pruneRateLimitMap() {
  const now = Date.now()
  if (now - lastPrune < PRUNE_INTERVAL) return
  lastPrune = now
  for (const [ip, timestamp] of rateLimitMap) {
    if (now - timestamp > RATE_WINDOW) rateLimitMap.delete(ip)
  }
}

export async function POST(request: Request) {
  pruneRateLimitMap()

  const ip = getClientIp(request)
  const now = Date.now()
  if ((rateLimitMap.get(ip) ?? 0) + RATE_WINDOW > now) {
    return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429 })
  }
  rateLimitMap.set(ip, now)

  const body = await request.json().catch(() => ({} as Record<string, unknown>))

  // Sanitize: strip HTML tags, control characters, and clamp length
  const name = stripControlChars(sanitizeText(clampLength(String(body.name ?? ''), 100)))
  const email = stripControlChars(sanitizeText(String(body.email ?? '').trim().toLowerCase()))
  const message = sanitizeText(clampLength(String(body.message ?? ''), 2000))

  if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 })
  if (!isValidEmail(email)) return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 })

  const { createServiceRoleClient } = await import('@/lib/supabase/server')
  const supabase = createServiceRoleClient()

  // Save message to database (Supabase uses parameterized queries — no SQL injection)
  const { error: dbError } = await supabase.from('messages').insert({ name, email, message })
  if (dbError) {
    console.error('[Contact] DB error:', dbError.message)
    return NextResponse.json({ error: 'Failed to save message. Please try again.' }, { status: 500 })
  }

  // Send notification email to admin (non-blocking — don't fail the request if email fails)
  const { sendContactNotification } = await import('@/lib/email')
  sendContactNotification(name, email, message).catch(err => {
    console.error('[Contact] Notification email error:', err)
  })

  return NextResponse.json({ success: true })
}
