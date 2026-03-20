import { Resend } from 'resend'
import type { Newsletter, NewsletterSubscriber } from '@/lib/supabase/types'
import { addUtmParams } from '@/lib/newsletter'
import { isValidHttpsUrl } from '@/lib/validate'
import { sanitizeText } from '@/lib/sanitize'

export function getResendClient(apiKey: string) {
  return new Resend(apiKey)
}

export function buildNewsletterEmail(
  newsletter: Newsletter,
  unsubscribeToken: string,
  siteUrl: string
): string {
  const newsletterUrl = addUtmParams(`${siteUrl}/newsletter/${newsletter.slug}`, newsletter.slug)
  const unsubscribeUrl = `${siteUrl}/newsletter/unsubscribe?token=${unsubscribeToken}`

  const heroBlock = newsletter.hero_image_url && isValidHttpsUrl(newsletter.hero_image_url)
    ? `<img src="${newsletter.hero_image_url}" alt="" style="width:100%;max-width:600px;height:auto;display:block;border-radius:4px;margin:0 auto 24px;" />`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${sanitizeText(newsletter.subject_line)}</title>
</head>
<body style="margin:0;padding:0;background:#f5ede0;font-family:Georgia,serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5ede0;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
        <!-- Header -->
        <tr><td style="background:#2d1b4e;padding:24px 32px;text-align:center;">
          <p style="margin:0;font-size:20px;color:#ffffff;font-family:Georgia,serif;letter-spacing:1px;">Purple Acorns Creations</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          ${heroBlock}
          <h1 style="margin:0 0 12px;font-size:26px;color:#1a0f2e;font-family:Georgia,serif;line-height:1.3;">${sanitizeText(newsletter.title)}</h1>
          <p style="margin:0 0 24px;font-size:16px;color:#6b5b7b;line-height:1.6;">${sanitizeText(newsletter.teaser_text)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr><td style="background:#d4a853;border-radius:4px;padding:14px 28px;text-align:center;">
              <a href="${newsletterUrl}" style="color:#1a0f2e;text-decoration:none;font-size:16px;font-family:Georgia,serif;">Read the full story →</a>
            </td></tr>
          </table>
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#fff8f0;padding:24px 32px;text-align:center;border-top:1px solid #e8d9c5;">
          <p style="margin:0;font-size:13px;color:#6b5b7b;">
            You're receiving this because you subscribed to Purple Acorns Creations updates.<br/>
            <a href="${unsubscribeUrl}" style="color:#2d1b4e;">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export async function sendNewsletterBatch(
  resend: Resend,
  newsletter: Newsletter,
  subscribers: Array<{ email: string; unsubscribe_token: string }>,
  fromAddress: string,
  siteUrl: string
): Promise<{ sent: number; failed: number; messageIds: Record<string, string> }> {
  const BATCH_SIZE = 50
  let sent = 0
  let failed = 0
  const messageIds: Record<string, string> = {}

  for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
    const batch = subscribers.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(
      batch.map(async (sub) => {
        const html = buildNewsletterEmail(newsletter, sub.unsubscribe_token, siteUrl)
        try {
          const result = await resend.emails.send({
            from: fromAddress,
            to: sub.email,
            subject: newsletter.subject_line,
            html,
          })
          if (result.error) {
            console.error('[resend] send error for', sub.email, result.error)
            return { email: sub.email, ok: false, messageId: null }
          }
          return { email: sub.email, ok: true, messageId: result.data?.id ?? null }
        } catch (err) {
          console.error('[resend] exception for', sub.email, err)
          return { email: sub.email, ok: false, messageId: null }
        }
      })
    )

    for (const r of results) {
      if (r.ok && r.messageId) {
        sent++
        messageIds[r.email] = r.messageId
      } else {
        failed++
      }
    }
  }

  return { sent, failed, messageIds }
}
