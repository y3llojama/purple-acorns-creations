import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getResendClient, sendNewsletterBatch } from '@/lib/resend'
import type { Newsletter, NewsletterSubscriber } from '@/lib/supabase/types'
import { decryptSettings } from '@/lib/crypto'

export async function GET(request: Request) {
  // Validate cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const supabase = createServiceRoleClient()
  const now = new Date().toISOString()

  // Find scheduled newsletters due to send
  const { data: newsletters, error: nlError } = await supabase
    .from('newsletters')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)

  if (nlError) {
    console.error('[cron] Failed to fetch newsletters:', nlError.message)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }

  if (!newsletters || newsletters.length === 0) {
    return NextResponse.json({ processed: 0 })
  }

  // Fetch settings once
  const { data: rawSettings } = await supabase.from('settings').select('resend_api_key, newsletter_from_name, newsletter_from_email, business_name').single()
  const settings = rawSettings ? decryptSettings(rawSettings) : null
  const resendApiKey = process.env.RESEND_API_KEY ?? settings?.resend_api_key
  const fromEmail = process.env.NEWSLETTER_FROM_EMAIL ?? settings?.newsletter_from_email
  const fromName = (process.env.NEWSLETTER_FROM_NAME ?? settings?.newsletter_from_name ?? settings?.business_name ?? 'Purple Acorns Creations')
    .replace(/\$\{BUSINESS_NAME\}/g, settings?.business_name ?? '')
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://purpleacornz.com'

  if (!resendApiKey || !fromEmail) {
    console.error('[newsletter-cron] Resend credentials not configured')
    return NextResponse.json({ error: 'Resend not configured' }, { status: 500 })
  }

  let processed = 0

  for (const newsletter of newsletters) {
    try {
      // Fetch active subscribers
      const { data: subscribers, error: subError } = await supabase
        .from('newsletter_subscribers')
        .select('email, unsubscribe_token')
        .eq('status', 'active')

      if (subError) {
        console.error(`[cron] Failed to fetch subscribers for newsletter ${newsletter.id}:`, subError.message)
        continue
      }

      if (!subscribers || subscribers.length === 0) {
        await supabase.from('newsletters').update({ status: 'cancelled' }).eq('id', newsletter.id)
        console.warn(`[cron] No active subscribers for newsletter ${newsletter.id}, marking cancelled`)
        continue
      }

      // Idempotency: skip emails already sent for this newsletter
      const { data: alreadySent } = await supabase
        .from('newsletter_send_log')
        .select('email')
        .eq('newsletter_id', newsletter.id)

      const alreadySentEmails = new Set((alreadySent ?? []).map((r: { email: string }) => r.email))
      const pendingSubscribers = subscribers.filter((s: { email: string; unsubscribe_token: string }) => !alreadySentEmails.has(s.email))

      if (pendingSubscribers.length === 0) {
        // All already sent — just mark as sent
        await supabase.from('newsletters').update({ status: 'sent', sent_at: now }).eq('id', newsletter.id)
        processed++
        continue
      }

      const resend = getResendClient(resendApiKey)
      const fromAddress = `${fromName} <${fromEmail}>`

      let allSucceeded = true
      try {
        const { sent, failed, messageIds } = await sendNewsletterBatch(resend, newsletter as Newsletter, pendingSubscribers, fromAddress, siteUrl)

        // Write send log rows
        const logRows = pendingSubscribers.map((sub: { email: string; unsubscribe_token: string }) => ({
          newsletter_id: newsletter.id,
          email: sub.email,
          resend_message_id: messageIds[sub.email] ?? null,
          status: messageIds[sub.email] ? 'sent' : 'failed',
        }))

        if (logRows.length > 0) {
          const { error: logError } = await supabase.from('newsletter_send_log').insert(logRows)
          if (logError) {
            console.error(`[cron] Failed to write send log for newsletter ${newsletter.id}:`, logError.message)
            allSucceeded = false
          }
        }

        if (failed > 0) {
          console.warn(`[cron] ${failed} emails failed for newsletter ${newsletter.id}`)
          allSucceeded = false
        }
      } catch (batchError) {
        console.error(`[cron] Batch send threw for newsletter ${newsletter.id}:`, batchError)
        allSucceeded = false
      }

      // Only mark sent if all batches complete — otherwise leave as scheduled for retry
      if (allSucceeded) {
        await supabase.from('newsletters').update({ status: 'sent', sent_at: now }).eq('id', newsletter.id)
        processed++
      }
    } catch (err) {
      console.error(`[cron] Unexpected error for newsletter ${newsletter.id}:`, err)
    }
  }

  return NextResponse.json({ processed })
}
