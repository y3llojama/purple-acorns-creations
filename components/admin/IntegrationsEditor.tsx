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
const testBtnStyle: React.CSSProperties = { background: 'transparent', color: 'var(--color-primary)', padding: '10px 20px', fontSize: '16px', border: '1px solid var(--color-border)', borderRadius: '4px', cursor: 'pointer', minHeight: '48px', marginLeft: '8px' }

async function testIntegration(type: 'ai' | 'resend' | 'smtp') {
  const res = await fetch('/api/admin/test-integration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type }),
  })
  const data = await res.json()
  return { ok: res.ok, message: data.message ?? data.error ?? 'Unknown response' }
}

interface Props {
  initialMode: 'gallery' | 'widget'
  initialPhotos: FollowAlongPhoto[]
  initialBeholdWidgetId: string
  hasResendApiKey: boolean
  initialMessagesFromEmail: string
  initialReplyEmailFooter: string
  initialNewsletterFromName: string
  initialNewsletterFromEmail: string
  initialNewsletterAdminEmails: string
  initialNewsletterSendTime: string
  initialAiProvider: string
  hasAiApiKey: boolean
  hasSearchApiKey: boolean
}

export default function IntegrationsEditor({
  initialMode, initialPhotos, initialBeholdWidgetId,
  hasResendApiKey, initialMessagesFromEmail, initialReplyEmailFooter,
  initialNewsletterFromName, initialNewsletterFromEmail,
  initialNewsletterAdminEmails, initialNewsletterSendTime,
  initialAiProvider, hasAiApiKey, hasSearchApiKey,
}: Props) {

  const [behold, setBehold] = useState(initialBeholdWidgetId)
  const [beholdSaved, setBeholdSaved] = useState(false)

  const [socials, setSocials] = useState({ instagram: '', facebook: '', tiktok: '', pinterest: '', x: '' })
  const [socialsSaved, setSocialsSaved] = useState(false)

  const [contactEmail, setContactEmail] = useState('')
  const [contactSaved, setContactSaved] = useState(false)

  const [messagesFromEmail, setMessagesFromEmail] = useState(initialMessagesFromEmail)
  const [replyEmailFooter, setReplyEmailFooter] = useState(initialReplyEmailFooter)

  // API key fields: start empty — submitting empty = keep existing key
  const [resendApiKey, setResendApiKey] = useState('')
  const [newsletterFromName, setNewsletterFromName] = useState(initialNewsletterFromName)
  const [newsletterFromEmail, setNewsletterFromEmail] = useState(initialNewsletterFromEmail)
  const [newsletterAdminEmails, setNewsletterAdminEmails] = useState(initialNewsletterAdminEmails)
  const [newsletterSendTime, setNewsletterSendTime] = useState(initialNewsletterSendTime)
  const [resendSaved, setResendSaved] = useState(false)

  const [searchApiKey, setSearchApiKey] = useState('')
  const [searchSaved, setSearchSaved] = useState(false)

  const [aiProvider, setAiProvider] = useState(initialAiProvider)
  const [aiApiKey, setAiApiKey] = useState('')
  const [aiSaved, setAiSaved] = useState(false)
  const [aiTestResult, setAiTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [aiTesting, setAiTesting] = useState(false)

  const [resendTestResult, setResendTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [resendTesting, setResendTesting] = useState(false)

  const [smtpTestResult, setSmtpTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [smtpTesting, setSmtpTesting] = useState(false)

  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [smtpSaved, setSmtpSaved] = useState(false)

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', marginBottom: '32px' }}>Integrations</h1>

      <FollowAlongManager initialMode={initialMode} initialPhotos={initialPhotos} hasBehold={!!initialBeholdWidgetId} />

      <Section title="Instagram Embed (Behold.so)">
        {!behold && (
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
            Not configured. Add a widget ID below to enable the automatic Instagram feed.
          </p>
        )}
        <label htmlFor="behold-id" style={labelStyle}>
          Behold Widget ID{' '}
          {behold && <span style={{ color: 'green', fontWeight: 400, fontSize: '13px' }}>✓ configured</span>}
        </label>
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

      <Section title="Email (SMTP — fallback)">
        <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginBottom: '16px' }}>
          Optional. Used as a fallback for contact notifications and replies if Resend is not configured or fails.
          Emails will appear to come from the SMTP account address.
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
        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <button style={btnStyle} onClick={async () => {
            const r = await save({
              smtp_host: smtpHost || 'smtp.gmail.com',
              smtp_port: smtpPort || '587',
              smtp_user: smtpUser,
              smtp_pass: smtpPass,
            })
            if (r.ok) setSmtpSaved(true)
          }}>Save SMTP Settings</button>
          <button style={testBtnStyle} disabled={smtpTesting} onClick={async () => {
            setSmtpTesting(true); setSmtpTestResult(null)
            const result = await testIntegration('smtp')
            setSmtpTestResult(result); setSmtpTesting(false)
          }}>{smtpTesting ? 'Testing…' : 'Test Connection'}</button>
          <SavedStatus saved={smtpSaved} />
          {smtpTestResult && (
            <span role="status" aria-live="polite" style={{ fontSize: '14px', color: smtpTestResult.ok ? 'green' : 'red' }}>
              {smtpTestResult.ok ? '✓' : '✗'} {smtpTestResult.message}
            </span>
          )}
        </div>
      </Section>

      <Section title="Newsletter and Messages (Resend)">
        <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginBottom: '16px' }}>
          Used to send newsletters and contact message replies. Get your API key at{' '}
          <a href="https://resend.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)' }}>resend.com</a>.
        </p>
        <label htmlFor="resend-api-key" style={labelStyle}>Resend API Key {hasResendApiKey && <span style={{ color: 'green', fontWeight: 400, fontSize: '13px' }}>✓ saved</span>}</label>
        <input id="resend-api-key" type="password" value={resendApiKey} onChange={e => { setResendApiKey(e.target.value); setResendSaved(false) }} placeholder={hasResendApiKey ? '•••••••• (leave blank to keep current)' : 're_...'} style={inputStyle} />
        <label htmlFor="newsletter-from-name" style={{ ...labelStyle, marginTop: '12px' }}>From Name</label>
        <input id="newsletter-from-name" value={newsletterFromName} onChange={e => { setNewsletterFromName(e.target.value); setResendSaved(false) }} placeholder="Purple Acorns Creations" style={inputStyle} />
        <label htmlFor="newsletter-from-email" style={{ ...labelStyle, marginTop: '12px' }}>Newsletter From Email</label>
        <input id="newsletter-from-email" type="email" value={newsletterFromEmail} onChange={e => { setNewsletterFromEmail(e.target.value); setResendSaved(false) }} placeholder="newsletter@yourdomain.com" style={inputStyle} />
        <label htmlFor="messages-from-email" style={{ ...labelStyle, marginTop: '12px' }}>Messages From Email</label>
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Used for contact notifications and admin replies. Customer replies to this address will be forwarded to your inbox.</p>
        <input id="messages-from-email" type="email" value={messagesFromEmail} onChange={e => { setMessagesFromEmail(e.target.value); setResendSaved(false) }} placeholder="hello@yourdomain.com" style={inputStyle} />
        <label htmlFor="reply-footer" style={{ ...labelStyle, marginTop: '12px' }}>Reply email footer</label>
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Appended to every reply email. Variables: <code>{'${BUSINESS_NAME}'}</code> · <code>{'${CONTACT_FORM}'}</code></p>
        <textarea
          id="reply-footer"
          value={replyEmailFooter}
          onChange={e => { setReplyEmailFooter(e.target.value); setResendSaved(false) }}
          rows={4}
          style={{ width: '100%', padding: '10px', fontSize: '14px', borderRadius: '4px', border: '1px solid var(--color-border)', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, marginBottom: '8px' }}
        />
        <label htmlFor="newsletter-admin-emails" style={{ ...labelStyle, marginTop: '12px' }}>Admin Preview Emails</label>
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Comma-separated. These addresses receive a preview before the newsletter goes out.</p>
        <input id="newsletter-admin-emails" value={newsletterAdminEmails} onChange={e => { setNewsletterAdminEmails(e.target.value); setResendSaved(false) }} placeholder="you@example.com, partner@example.com" style={inputStyle} />
        <label htmlFor="newsletter-send-time" style={{ ...labelStyle, marginTop: '12px' }}>Default Send Time</label>
        <input id="newsletter-send-time" type="time" value={newsletterSendTime} onChange={e => { setNewsletterSendTime(e.target.value); setResendSaved(false) }} style={{ ...inputStyle, width: 'auto' }} />
        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <button style={btnStyle} onClick={async () => {
            const r = await save({ resend_api_key: resendApiKey, newsletter_from_name: newsletterFromName, newsletter_from_email: newsletterFromEmail, messages_from_email: messagesFromEmail, reply_email_footer: replyEmailFooter, newsletter_admin_emails: newsletterAdminEmails, newsletter_scheduled_send_time: newsletterSendTime })
            if (r.ok) setResendSaved(true)
          }}>Save Newsletter Settings</button>
          <button style={testBtnStyle} disabled={resendTesting} onClick={async () => {
            setResendTesting(true); setResendTestResult(null)
            const result = await testIntegration('resend')
            setResendTestResult(result); setResendTesting(false)
          }}>{resendTesting ? 'Testing…' : 'Test Resend'}</button>
          <SavedStatus saved={resendSaved} />
          {resendTestResult && (
            <span role="status" aria-live="polite" style={{ fontSize: '14px', color: resendTestResult.ok ? 'green' : 'red' }}>
              {resendTestResult.ok ? '✓' : '✗'} {resendTestResult.message}
            </span>
          )}
        </div>
      </Section>

      <Section title="Event Search (Tavily)">
        <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginBottom: '16px' }}>
          Used by "Find Events" to search the web for Purple Acornz events in MA / NH / RI. Get a free API key (1,000 searches/month) at{' '}
          <a href="https://tavily.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)' }}>tavily.com</a>.
        </p>
        <label htmlFor="search-api-key" style={labelStyle}>
          Tavily API Key {hasSearchApiKey && <span style={{ color: 'green', fontWeight: 400, fontSize: '13px' }}>✓ saved</span>}
        </label>
        <input
          id="search-api-key"
          type="password"
          value={searchApiKey}
          onChange={e => { setSearchApiKey(e.target.value); setSearchSaved(false) }}
          placeholder={hasSearchApiKey ? '•••••••• (leave blank to keep current)' : 'tvly-...'}
          style={inputStyle}
        />
        <button style={btnStyle} onClick={async () => {
          const r = await save({ search_api_key: searchApiKey })
          if (r.ok) setSearchSaved(true)
        }}>Save</button>
        <SavedStatus saved={searchSaved} />
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
        <label htmlFor="ai-api-key" style={{ ...labelStyle, marginTop: '12px' }}>API Key {hasAiApiKey && <span style={{ color: 'green', fontWeight: 400, fontSize: '13px' }}>✓ saved</span>}</label>
        <input id="ai-api-key" type="password" value={aiApiKey} onChange={e => { setAiApiKey(e.target.value); setAiSaved(false) }} placeholder={hasAiApiKey ? '•••••••• (leave blank to keep current)' : 'sk-...'} style={inputStyle} />
        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <button style={btnStyle} onClick={async () => {
            const r = await save({ ai_provider: aiProvider || null, ai_api_key: aiApiKey })
            if (r.ok) setAiSaved(true)
          }}>Save AI Settings</button>
          <button style={testBtnStyle} disabled={aiTesting} onClick={async () => {
            setAiTesting(true); setAiTestResult(null)
            const result = await testIntegration('ai')
            setAiTestResult(result); setAiTesting(false)
          }}>{aiTesting ? 'Testing…' : 'Test AI'}</button>
          <SavedStatus saved={aiSaved} />
          {aiTestResult && (
            <span role="status" aria-live="polite" style={{ fontSize: '14px', color: aiTestResult.ok ? 'green' : 'red' }}>
              {aiTestResult.ok ? '✓' : '✗'} {aiTestResult.message}
            </span>
          )}
        </div>
      </Section>
    </div>
  )
}
