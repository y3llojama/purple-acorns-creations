import nodemailer from 'nodemailer'
import { Resend } from 'resend'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { stripControlChars } from '@/lib/validate'
import { interpolate, buildVars } from '@/lib/variables'
import { decryptSettings } from '@/lib/crypto'

interface SendEmailOptions {
  to: string
  subject: string
  text: string
  html?: string
  replyTo?: string
}

/** Escape user-supplied strings for safe interpolation into HTML email templates */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

async function getEmailSettings() {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('settings')
    .select('contact_email, smtp_host, smtp_port, smtp_user, smtp_pass, business_name, resend_api_key, newsletter_from_name, messages_from_email')
    .single()
  return data ? decryptSettings(data) : data
}

async function sendViaResend(
  settings: Awaited<ReturnType<typeof getEmailSettings>>,
  options: SendEmailOptions
): Promise<{ success: boolean; error?: string }> {
  if (!settings?.resend_api_key || !settings?.messages_from_email) {
    return { success: false, error: 'Resend not configured' }
  }

  const resend = new Resend(settings.resend_api_key)
  const fromName = settings.newsletter_from_name ?? settings.business_name ?? 'Purple Acorns Creations'
  const from = `${fromName} <${settings.messages_from_email}>`

  const result = await resend.emails.send({
    from,
    to: options.to,
    subject: stripControlChars(options.subject),
    text: options.text,
    html: options.html,
    replyTo: options.replyTo,
  })

  if (result.error) {
    const message = result.error.message ?? 'Resend send failed'
    console.error('[Email] Resend error:', message)
    return { success: false, error: message }
  }

  return { success: true }
}

async function sendViaSmtp(
  settings: Awaited<ReturnType<typeof getEmailSettings>>,
  options: SendEmailOptions
): Promise<{ success: boolean; error?: string }> {
  if (!settings?.smtp_user || !settings?.smtp_pass) {
    return { success: false, error: 'SMTP not configured' }
  }

  const transport = nodemailer.createTransport({
    host: settings.smtp_host ?? 'smtp.gmail.com',
    port: settings.smtp_port ?? 587,
    secure: (settings.smtp_port ?? 587) === 465,
    auth: {
      user: settings.smtp_user,
      pass: settings.smtp_pass,
    },
  })

  try {
    await transport.sendMail({
      from: settings.contact_email ?? settings.smtp_user,
      to: options.to,
      subject: stripControlChars(options.subject),
      text: options.text,
      html: options.html,
      replyTo: options.replyTo,
    })
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'SMTP send failed'
    console.error('[Email] SMTP error:', message)
    return { success: false, error: message }
  }
}

export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  const settings = await getEmailSettings()

  // Try Resend first
  const resendResult = await sendViaResend(settings, options)
  if (resendResult.success) return { success: true }

  // Fall back to SMTP if configured
  const smtpResult = await sendViaSmtp(settings, options)
  if (smtpResult.success) return { success: true }

  // Neither configured — log and return success to avoid breaking contact form UX
  if (resendResult.error === 'Resend not configured' && smtpResult.error === 'SMTP not configured') {
    console.log(`[Email] No email provider configured. Would send to: ${options.to} | Subject: ${options.subject}`)
    return { success: true }
  }

  // Both were configured but both failed — return the Resend error as primary
  return { success: false, error: resendResult.error }
}

export async function sendContactNotification(name: string, email: string, message: string) {
  const settings = await getEmailSettings()
  if (!settings?.contact_email) return

  // Escape all user-supplied values for safe HTML interpolation
  const safeName = escapeHtml(stripControlChars(name))
  const safeEmail = escapeHtml(stripControlChars(email))
  const safeMessage = escapeHtml(message)

  return sendEmail({
    to: settings.contact_email,
    subject: `New message from ${stripControlChars(name)}`,
    replyTo: email,
    text: `New contact form submission:\n\nFrom: ${stripControlChars(name)} <${email}>\n\nMessage:\n${message}`,
    html: `<h2>New contact form submission</h2>
<p><strong>From:</strong> ${safeName} &lt;${safeEmail}&gt;</p>
<hr />
<p>${safeMessage.replace(/\n/g, '<br />')}</p>
<hr />
<p><em>Reply directly to this email to respond to ${safeName}.</em></p>`,
  })
}

export async function sendReply(to: string, toName: string, body: string) {
  const settings = await getEmailSettings()
  const businessName = settings?.business_name ?? 'Purple Acorns Creations'
  const resolvedBody = interpolate(body, buildVars(businessName))
  const safeName = escapeHtml(stripControlChars(toName))
  const safeBody = escapeHtml(resolvedBody)
  const safeBusinessName = escapeHtml(businessName)

  return sendEmail({
    to,
    subject: `Reply from ${businessName}`,
    text: `Hi ${stripControlChars(toName)},\n\n${resolvedBody}\n\n— ${businessName}`,
    html: `<p>Hi ${safeName},</p>
<p>${safeBody.replace(/\n/g, '<br />')}</p>
<p>— ${safeBusinessName}</p>`,
  })
}
