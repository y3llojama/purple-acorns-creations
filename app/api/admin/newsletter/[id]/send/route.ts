import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getResendClient, buildNewsletterEmail, sendNewsletterBatch } from '@/lib/resend'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: RouteContext) {
  const { error } = await requireAdminSession()
  if (error) return error

  const body = await request.json().catch(() => ({}))

  // Exact string match — case-sensitive, server-side
  if ((body as { confirmation?: string }).confirmation !== 'SEND NEWSLETTER') {
    return NextResponse.json({ error: 'Type SEND NEWSLETTER to confirm.' }, { status: 400 })
  }

  const scheduledAt = (body as { scheduled_at?: string }).scheduled_at
  if (!scheduledAt) {
    return NextResponse.json({ error: 'scheduled_at is required.' }, { status: 400 })
  }
  const scheduledTime = new Date(scheduledAt).getTime()
  if (isNaN(scheduledTime) || scheduledTime < Date.now() + 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: 'Scheduled time must be at least 24 hours from now.' }, { status: 400 })
  }

  const { id } = await params
  const supabase = createServiceRoleClient()

  // Parallel fetch settings + newsletter + subscriber count
  const [settingsResult, newsletterResult, countResult] = await Promise.all([
    supabase.from('settings').select('resend_api_key, newsletter_from_name, newsletter_from_email, newsletter_admin_emails').single(),
    supabase.from('newsletters').select('*').eq('id', id).single(),
    supabase.from('newsletter_subscribers').select('*', { count: 'exact', head: true }).eq('status', 'active'),
  ])

  if (newsletterResult.error || !newsletterResult.data) {
    return NextResponse.json({ error: 'Newsletter not found.' }, { status: 404 })
  }

  const settings = settingsResult.data
  const resendApiKey = process.env.RESEND_API_KEY ?? settings?.resend_api_key
  const fromEmail = process.env.NEWSLETTER_FROM_EMAIL ?? settings?.newsletter_from_email
  const fromName = process.env.NEWSLETTER_FROM_NAME ?? settings?.newsletter_from_name ?? 'Purple Acorns Creations'

  if (!resendApiKey || !fromEmail) {
    return NextResponse.json(
      { error: 'Resend is not configured. Set RESEND_API_KEY and NEWSLETTER_FROM_EMAIL in Admin → Integrations.' },
      { status: 503 }
    )
  }

  const subscriberCount = countResult.count ?? 0
  if (subscriberCount === 0) {
    return NextResponse.json({ error: 'No active subscribers to send to.' }, { status: 400 })
  }

  // Send admin preview emails immediately
  const adminEmailsStr = process.env.NEWSLETTER_ADMIN_EMAILS ?? settings?.newsletter_admin_emails ?? ''
  const adminEmails = adminEmailsStr.split(',').map((e: string) => e.trim()).filter(Boolean)
  if (adminEmails.length > 0) {
    const resend = getResendClient(resendApiKey)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://purpleacornz.com'
    const adminSubscribers = adminEmails.map((email: string) => ({ email, unsubscribe_token: 'admin-preview' }))
    try {
      await sendNewsletterBatch(resend, newsletterResult.data, adminSubscribers, `${fromName} <${fromEmail}>`, siteUrl)
    } catch (err) {
      console.error('[send] admin preview failed:', err)
      // Don't block the scheduling if admin preview fails
    }
  }

  // Schedule the newsletter
  const { error: updateError } = await supabase
    .from('newsletters')
    .update({ status: 'scheduled', scheduled_at: scheduledAt })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, scheduled_at: scheduledAt, subscriber_count: subscriberCount })
}
