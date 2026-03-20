import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isValidEmail } from '@/lib/validate'

const rateLimitMap = new Map<string, number>()

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
  const now = Date.now()
  if (now - (rateLimitMap.get(ip) ?? 0) < 60_000) {
    return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429 })
  }
  const body = await request.json().catch(() => ({}))
  const email = ((body as { email?: string }).email ?? '').toString().trim().toLowerCase()
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }
  rateLimitMap.set(ip, now)

  const supabase = createServiceRoleClient()
  const { error } = await supabase
    .from('newsletter_subscribers')
    .upsert({ email, status: 'active', source: 'public_signup' }, { onConflict: 'email', ignoreDuplicates: false })

  if (error) {
    console.error('[subscribe] DB error:', error.message)
    return NextResponse.json({ error: 'Could not subscribe. Please try again.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
