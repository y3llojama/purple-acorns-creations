import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isValidEmail } from '@/lib/validate'
import { getClientIp } from '@/lib/get-client-ip'

// Simple in-memory rate limiter: 1 request per IP per 60 seconds
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
  const last = rateLimitMap.get(ip) ?? 0
  if (now - last < RATE_WINDOW) {
    return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429 })
  }
  rateLimitMap.set(ip, now)

  const body = await request.json().catch(() => ({}))
  const email = ((body as { email?: string }).email ?? '').toString().trim().toLowerCase()

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  // Check if already subscribed
  const { data: existing } = await supabase
    .from('newsletter_subscribers')
    .select('status')
    .eq('email', email)
    .single()

  if (existing?.status === 'active') {
    return NextResponse.json({ success: true })
  }

  if (existing?.status === 'bounced') {
    // Don't re-add bounced addresses
    return NextResponse.json({ success: true })
  }

  if (existing?.status === 'unsubscribed') {
    // Reactivate
    const { error } = await supabase
      .from('newsletter_subscribers')
      .update({ status: 'active', unsubscribed_at: null })
      .eq('email', email)
    if (error) return NextResponse.json({ error: 'Could not subscribe. Please try again.' }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // New subscriber
  const { error } = await supabase
    .from('newsletter_subscribers')
    .insert({ email, status: 'active', source: 'public_signup' })
  if (error) return NextResponse.json({ error: 'Could not subscribe. Please try again.' }, { status: 500 })

  return NextResponse.json({ success: true })
}
