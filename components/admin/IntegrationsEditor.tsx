'use client'
import { useState } from 'react'
import FollowAlongManager from './FollowAlongManager'
import type { FollowAlongPhoto } from '@/lib/supabase/types'

function SavedStatus({ saved }: { saved: boolean }) {
  if (!saved) return null
  return <span role="status" aria-live="polite" style={{ marginLeft: '12px', color: 'green', fontSize: '14px' }}>Saved ✓</span>
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '40px', paddingBottom: '40px', borderBottom: '1px solid var(--color-border)' }}>
      <h2 style={{ fontSize: '20px', marginBottom: '20px', color: 'var(--color-primary)' }}>{title}</h2>
      {children}
    </section>
  )
}

async function save(data: Record<string, string | boolean | null>) {
  return fetch('/api/admin/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
}

const inputStyle: React.CSSProperties = { width: '100%', padding: '10px', fontSize: '16px', borderRadius: '4px', border: '1px solid var(--color-border)', marginBottom: '8px' }
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }
const btnStyle: React.CSSProperties = { background: 'var(--color-primary)', color: 'var(--color-accent)', padding: '10px 20px', fontSize: '16px', border: 'none', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }

interface Props {
  initialMode: 'gallery' | 'widget'
  initialPhotos: FollowAlongPhoto[]
  initialResendApiKey: string
  initialNewsletterFromName: string
  initialNewsletterFromEmail: string
  initialNewsletterAdminEmails: string
  initialNewsletterSendTime: string
  initialAiProvider: string
  initialAiApiKey: string
}

export default function IntegrationsEditor({
  initialMode, initialPhotos,
  initialResendApiKey, initialNewsletterFromName, initialNewsletterFromEmail,
  initialNewsletterAdminEmails, initialNewsletterSendTime,
  initialAiProvider, initialAiApiKey,
}: Props) {
  const [square, setSquare] = useState('')
  const [squareSaved, setSquareSaved] = useState(false)

  const [behold, setBehold] = useState('')
  const [beholdSaved, setBeholdSaved] = useState(false)

  const [socials, setSocials] = useState({ instagram: '', facebook: '', tiktok: '', pinterest: '', x: '' })
  const [socialsSaved, setSocialsSaved] = useState(false)

  const [contactEmail, setContactEmail] = useState('')
  const [contactSaved, setContactSaved] = useState(false)

  const [resendApiKey, setResendApiKey] = useState(initialResendApiKey)
  const [newsletterFromName, setNewsletterFromName] = useState(initialNewsletterFromName)
  const [newsletterFromEmail, setNewsletterFromEmail] = useState(initialNewsletterFromEmail)
  const [newsletterAdminEmails, setNewsletterAdminEmails] = useState(initialNewsletterAdminEmails)
  const [newsletterSendTime, setNewsletterSendTime] = useState(initialNewsletterSendTime)
  const [resendSaved, setResendSaved] = useState(false)

  const [aiProvider, setAiProvider] = useState(initialAiProvider)
  const [aiApiKey, setAiApiKey] = useState(initialAiApiKey)
  const [aiSaved, setAiSaved] = useState(false)

  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [smtpSaved, setSmtpSaved] = useState(false)

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', marginBottom: '32px' }}>Integrations</h1>

      <FollowAlongManager initialMode={initialMode} initialPhotos={initialPhotos} />

      <Section title="Square Store">
        <label htmlFor="square-url" style={labelStyle}>Square Store URL</label>
        <input id="square-url" value={square} onChange={e => { setSquare(e.target.value); setSquareSaved(false) }} placeholder="https://square.site/..." style={inputStyle} />
        <button style={btnStyle} onClick={async () => { const r = await save({ square_store_url: square }); if (r.ok) setSquareSaved(true) }}>Save</button>
        <SavedStatus saved={squareSaved} />
      </Section>

      <Section title="Instagram Embed (Behold.so)">
        <label htmlFor="behold-id" style={labelStyle}>Behold Widget ID</label>
        <input id="behold-id" value={behold} onChange={e => { setBehold(e.target.value); setBeholdSaved(false) }} placeholder="e.g. abc123" style={inputStyle} />
        <a href="https://behold.so" target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginBottom: '12px', color: 'var(--color-primary)', fontSize: '14px' }}>Set up Behold.so →</a>
        <button style={btnStyle} onClick={async () => { const r = await save({ behold_widget_id: behold }); if (r.ok) setBeholdSaved(true) }}>Save</button>
        <SavedStatus saved={beholdSaved} />
      </Section>

      <Section title="Social Links">
        {[
          { id: 'social-instagram', field: 'instagram', label: 'Instagram Handle', placeholder: 'purpleacornz' },
          { id: 'social-facebook', field: 'facebook', label: 'Facebook URL', placeholder: 'https://facebook.com/...' },
          { id: 'social-tiktok', field: 'tiktok', label: 'TikTok Handle', placeholder: 'purpleacornz' },
          { id: 'social-pinterest', field: 'pinterest', label: 'Pinterest Handle', placeholder: 'purpleacornz' },
          { id: 'social-x', field: 'x', label: 'X (Twitter) Handle', placeholder: 'purpleacornz' },
        ].map(({ id, field, label, placeholder }) => (
          <div key={field} style={{ marginBottom: '12px' }}>
            <label htmlFor={id} style={labelStyle}>{label}</label>
            <input
              id={id}
              value={socials[field as keyof typeof socials]}
              onChange={e => { setSocials(s => ({ ...s, [field]: e.target.value })); setSocialsSaved(false) }}
              placeholder={placeholder}
              style={inputStyle}
            />
          </div>
        ))}
        <button style={btnStyle} onClick={async () => {
          const r = await save({ social_instagram: socials.instagram, social_facebook: socials.facebook, social_tiktok: socials.tiktok, social_pinterest: socials.pinterest, social_x: socials.x })
          if (r.ok) setSocialsSaved(true)
        }}>Save Social Links</button>
        <SavedStatus saved={socialsSaved} />
      </Section>

      <Section title="Contact Email">
        <label htmlFor="contact-email-input" style={labelStyle}>Contact Email</label>
        <input id="contact-email-input" type="email" value={contactEmail} onChange={e => { setContactEmail(e.target.value); setContactSaved(false) }} placeholder="you@example.com" style={inputStyle} />
        <button style={btnStyle} onClick={async () => { const r = await save({ contact_email: contactEmail }); if (r.ok) setContactSaved(true) }}>Save</button>
        <SavedStatus saved={contactSaved} />
      </Section>

      <Section title="Email (SMTP)">
        <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginBottom: '16px' }}>
          Used to send contact form notifications and message replies. Defaults to Gmail SMTP.
          For Gmail, use an <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)' }}>App Password</a> (not your regular password).
        </p>
        <label htmlFor="smtp-host" style={labelStyle}>SMTP Host</label>
        <input id="smtp-host" value={smtpHost} onChange={e => { setSmtpHost(e.target.value); setSmtpSaved(false) }} placeholder="smtp.gmail.com" style={inputStyle} />
        <label htmlFor="smtp-port" style={labelStyle}>SMTP Port</label>
        <input id="smtp-port" type="number" value={smtpPort} onChange={e => { setSmtpPort(e.target.value); setSmtpSaved(false) }} placeholder="587" style={inputStyle} />
        <label htmlFor="smtp-user" style={labelStyle}>SMTP Username (email)</label>
        <input id="smtp-user" value={smtpUser} onChange={e => { setSmtpUser(e.target.value); setSmtpSaved(false) }} placeholder="you@gmail.com" style={inputStyle} />
        <label htmlFor="smtp-pass" style={labelStyle}>SMTP Password / App Password</label>
        <input id="smtp-pass" type="password" value={smtpPass} onChange={e => { setSmtpPass(e.target.value); setSmtpSaved(false) }} placeholder="App password" style={inputStyle} />
        <button style={btnStyle} onClick={async () => {
          const r = await save({
            smtp_host: smtpHost || 'smtp.gmail.com',
            smtp_port: smtpPort || '587',
            smtp_user: smtpUser,
            smtp_pass: smtpPass,
          })
          if (r.ok) setSmtpSaved(true)
        }}>Save SMTP Settings</button>
        <SavedStatus saved={smtpSaved} />
      </Section>

      <Section title="Newsletter (Resend)">
        <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginBottom: '16px' }}>
          Used to send newsletters to subscribers. Get your API key at{' '}
          <a href="https://resend.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)' }}>resend.com</a>.
        </p>
        <label htmlFor="resend-api-key" style={labelStyle}>Resend API Key</label>
        <input id="resend-api-key" type="password" value={resendApiKey} onChange={e => { setResendApiKey(e.target.value); setResendSaved(false) }} placeholder="re_..." style={inputStyle} />
        <label htmlFor="newsletter-from-name" style={{ ...labelStyle, marginTop: '12px' }}>From Name</label>
        <input id="newsletter-from-name" value={newsletterFromName} onChange={e => { setNewsletterFromName(e.target.value); setResendSaved(false) }} placeholder="Purple Acorns Creations" style={inputStyle} />
        <label htmlFor="newsletter-from-email" style={{ ...labelStyle, marginTop: '12px' }}>From Email</label>
        <input id="newsletter-from-email" type="email" value={newsletterFromEmail} onChange={e => { setNewsletterFromEmail(e.target.value); setResendSaved(false) }} placeholder="newsletter@yourdomain.com" style={inputStyle} />
        <label htmlFor="newsletter-admin-emails" style={{ ...labelStyle, marginTop: '12px' }}>Admin Preview Emails</label>
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Comma-separated. These addresses receive a preview before the newsletter goes out.</p>
        <input id="newsletter-admin-emails" value={newsletterAdminEmails} onChange={e => { setNewsletterAdminEmails(e.target.value); setResendSaved(false) }} placeholder="you@example.com, partner@example.com" style={inputStyle} />
        <label htmlFor="newsletter-send-time" style={{ ...labelStyle, marginTop: '12px' }}>Default Send Time</label>
        <input id="newsletter-send-time" type="time" value={newsletterSendTime} onChange={e => { setNewsletterSendTime(e.target.value); setResendSaved(false) }} style={{ ...inputStyle, width: 'auto' }} />
        <div style={{ marginTop: '16px' }}>
          <button style={btnStyle} onClick={async () => {
            const r = await save({ resend_api_key: resendApiKey, newsletter_from_name: newsletterFromName, newsletter_from_email: newsletterFromEmail, newsletter_admin_emails: newsletterAdminEmails, newsletter_scheduled_send_time: newsletterSendTime })
            if (r.ok) setResendSaved(true)
          }}>Save Newsletter Settings</button>
          <SavedStatus saved={resendSaved} />
        </div>
      </Section>

      <Section title="AI Provider">
        <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginBottom: '16px' }}>
          Used to generate newsletter drafts. Provide your own API key for the selected provider.
        </p>
        <label htmlFor="ai-provider" style={labelStyle}>Provider</label>
        <select id="ai-provider" value={aiProvider} onChange={e => { setAiProvider(e.target.value); setAiSaved(false) }} style={{ ...inputStyle, cursor: 'pointer' }}>
          <option value="">— Select provider —</option>
          <option value="claude">Claude (Anthropic)</option>
          <option value="openai">OpenAI</option>
          <option value="groq">Groq</option>
        </select>
        <label htmlFor="ai-api-key" style={{ ...labelStyle, marginTop: '12px' }}>API Key</label>
        <input id="ai-api-key" type="password" value={aiApiKey} onChange={e => { setAiApiKey(e.target.value); setAiSaved(false) }} placeholder="sk-..." style={inputStyle} />
        <button style={btnStyle} onClick={async () => {
          const r = await save({ ai_provider: aiProvider || null, ai_api_key: aiApiKey })
          if (r.ok) setAiSaved(true)
        }}>Save AI Settings</button>
        <SavedStatus saved={aiSaved} />
      </Section>
    </div>
  )
}
