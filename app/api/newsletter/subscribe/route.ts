import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isValidEmail } from '@/lib/validate'

// Simple in-memory rate limiter: 1 request per IP per 60 seconds
const rateLimitMap = new Map<string, number>()

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
  const now = Date.now()
  const last = rateLimitMap.get(ip) ?? 0
  if (now - last < 60_000) {
    return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429 })
  }
  rateLimitMap.set(ip, now)

  const body = await request.json().catch(() => ({}))
  const email = ((body as { email?: string }).email ?? '').toString().trim().toLowerCase()

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const { data: settings } = await supabase
    .from('settings')
    .select('mailchimp_api_key, mailchimp_audience_id')
    .single()

  if (!settings?.mailchimp_api_key || !settings?.mailchimp_audience_id) {
    return NextResponse.json({ error: 'Newsletter not configured yet.' }, { status: 503 })
  }

  const dc = settings.mailchimp_api_key.split('-').pop()
  const res = await fetch(
    `https://${dc}.api.mailchimp.com/3.0/lists/${settings.mailchimp_audience_id}/members`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.mailchimp_api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email_address: email, status: 'pending' }),
    }
  ).catch(() => null)

  if (!res) {
    return NextResponse.json({ error: 'Could not subscribe. Please try again.' }, { status: 500 })
  }

  if (res.ok) return NextResponse.json({ success: true })

  const data = await res.json().catch(() => ({}))
  // Mailchimp returns "Member Exists" for already-subscribed emails — treat as success
  if ((data as { title?: string }).title === 'Member Exists') return NextResponse.json({ success: true })

  return NextResponse.json({ error: 'Could not subscribe. Please try again.' }, { status: 500 })
}
