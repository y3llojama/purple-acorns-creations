import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/get-client-ip'

const rateLimitMap = new Map<string, number>()

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const now = Date.now()
  if (now - (rateLimitMap.get(ip) ?? 0) < 60_000) {
    return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429 })
  }
  rateLimitMap.set(ip, now)

  const body = await request.json().catch(() => ({}))
  const token = ((body as { token?: string }).token ?? '').toString().trim()
  if (!token) return NextResponse.json({ error: 'Invalid token.' }, { status: 400 })

  // Token is generated as encode(gen_random_bytes(24), 'hex') — 48-char hex string
  if (!/^[0-9a-f]{48}$/.test(token)) {
    return NextResponse.json({ error: 'Invalid token.' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('newsletter_subscribers')
    .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
    .eq('unsubscribe_token', token)
    .eq('status', 'active')

  if (error) {
    console.error('[unsubscribe] DB error:', error.message)
    return NextResponse.json({ error: 'Could not unsubscribe.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
