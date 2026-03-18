import nodemailer from 'nodemailer'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { stripControlChars } from '@/lib/validate'

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

async function getSmtpSettings() {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('settings')
    .select('contact_email, smtp_host, smtp_port, smtp_user, smtp_pass, business_name')
    .single()
  return data
}

export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  const settings = await getSmtpSettings()

  if (!settings?.smtp_user || !settings?.smtp_pass) {
    console.log(`[Email] SMTP not configured. Would send to: ${options.to} | Subject: ${options.subject}`)
    return { success: true }
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
      // Strip control chars from subject to prevent header injection
      subject: stripControlChars(options.subject),
      text: options.text,
      html: options.html,
      replyTo: options.replyTo,
    })
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Email send failed'
    console.error('[Email] Send error:', message)
    return { success: false, error: message }
  }
}

export async function sendContactNotification(name: string, email: string, message: string) {
  const settings = await getSmtpSettings()
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
  const settings = await getSmtpSettings()
  const businessName = settings?.business_name ?? 'Purple Acorns Creations'
  const safeName = escapeHtml(stripControlChars(toName))
  const safeBody = escapeHtml(body)
  const safeBusinessName = escapeHtml(businessName)

  return sendEmail({
    to,
    subject: `Reply from ${businessName}`,
    text: `Hi ${stripControlChars(toName)},\n\n${body}\n\n— ${businessName}`,
    html: `<p>Hi ${safeName},</p>
<p>${safeBody.replace(/\n/g, '<br />')}</p>
<p>— ${safeBusinessName}</p>`,
  })
}
