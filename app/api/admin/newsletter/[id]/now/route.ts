import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getResendClient, sendNewsletterBatch } from '@/lib/resend'
import { decryptSettings } from '@/lib/crypto'
import { isValidUuid } from '@/lib/validate'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: RouteContext) {
  const { error } = await requireAdminSession()
  if (error) return error

  const body = await request.json().catch(() => ({}))

  // Exact string match — case-sensitive, server-side
  if ((body as { confirmation?: string }).confirmation !== 'SEND NEWSLETTER') {
    return NextResponse.json({ error: 'Type SEND NEWSLETTER to confirm.' }, { status: 400 })
  }

  const { id } = await params
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid newsletter id.' }, { status: 400 })
  }
  const supabase = createServiceRoleClient()

  // Parallel fetch settings, newsletter, and all active subscribers
  const [settingsResult, newsletterResult, subscribersResult] = await Promise.all([
    supabase.from('settings').select('resend_api_key, newsletter_from_name, newsletter_from_email, newsletter_admin_emails, business_name').single(),
    supabase.from('newsletters').select('*').eq('id', id).single(),
    supabase.from('newsletter_subscribers').select('email, unsubscribe_token').eq('status', 'active'),
  ])

  if (newsletterResult.error?.code === 'PGRST116' || !newsletterResult.data) {
    return NextResponse.json({ error: 'Newsletter not found.' }, { status: 404 })
  }
  if (newsletterResult.error) return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  if (settingsResult.error) return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })

  if (newsletterResult.data.status === 'sent') {
    return NextResponse.json({ error: 'This newsletter has already been sent.' }, { status: 400 })
  }

  const settings = settingsResult.data ? decryptSettings(settingsResult.data) : null
  const resendApiKey = process.env.RESEND_API_KEY ?? settings?.resend_api_key
  const fromEmail = process.env.NEWSLETTER_FROM_EMAIL ?? settings?.newsletter_from_email
  const fromName = (process.env.NEWSLETTER_FROM_NAME ?? settings?.newsletter_from_name ?? settings?.business_name ?? 'Purple Acorns Creations')
    .replace(/\$\{BUSINESS_NAME\}/g, settings?.business_name ?? '')

  if (!resendApiKey || !fromEmail) {
    return NextResponse.json(
      { error: 'Resend is not configured. Set RESEND_API_KEY and NEWSLETTER_FROM_EMAIL in Admin → Integrations.' },
      { status: 503 }
    )
  }

  const subscribers = subscribersResult.data ?? []
  if (subscribers.length === 0) {
    return NextResponse.json({ error: 'No active subscribers to send to.' }, { status: 400 })
  }

  const resend = getResendClient(resendApiKey)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://purpleacornz.com'
  const { sent, failed } = await sendNewsletterBatch(
    resend, newsletterResult.data, subscribers, `${fromName} <${fromEmail}>`, siteUrl
  )

  const sentAt = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('newsletters')
    .update({ status: 'sent', sent_at: sentAt })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, sent, failed, sent_at: sentAt })
}
