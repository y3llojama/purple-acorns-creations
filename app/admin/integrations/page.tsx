'use client'
import { useState } from 'react'


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

export default function IntegrationsPage() {
  const [square, setSquare] = useState('')
  const [squareSaved, setSquareSaved] = useState(false)

  const [behold, setBehold] = useState('')
  const [beholdSaved, setBeholdSaved] = useState(false)

  const [socials, setSocials] = useState({ instagram: '', facebook: '', tiktok: '', pinterest: '', x: '' })
  const [socialsSaved, setSocialsSaved] = useState(false)

  const [contactEmail, setContactEmail] = useState('')
  const [contactSaved, setContactSaved] = useState(false)

  const [mailchimpKey, setMailchimpKey] = useState('')
  const [mailchimpAudience, setMailchimpAudience] = useState('')
  const [mailchimpSaved, setMailchimpSaved] = useState(false)

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', marginBottom: '32px' }}>Integrations</h1>

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

      <Section title="Newsletter (Mailchimp)">
        <label htmlFor="mailchimp-key" style={labelStyle}>Mailchimp API Key</label>
        <input id="mailchimp-key" value={mailchimpKey} onChange={e => { setMailchimpKey(e.target.value); setMailchimpSaved(false) }} placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-us1" style={inputStyle} />
        <label htmlFor="mailchimp-audience" style={{ ...labelStyle, marginTop: '12px' }}>Mailchimp Audience ID</label>
        <input id="mailchimp-audience" value={mailchimpAudience} onChange={e => { setMailchimpAudience(e.target.value); setMailchimpSaved(false) }} placeholder="abc1234567" style={inputStyle} />
        <button style={btnStyle} onClick={async () => { const r = await save({ mailchimp_api_key: mailchimpKey, mailchimp_audience_id: mailchimpAudience }); if (r.ok) setMailchimpSaved(true) }}>Save</button>
        <SavedStatus saved={mailchimpSaved} />
      </Section>

      <Section title="AI Provider">
        <p style={{ color: 'var(--color-text-muted)', fontSize: '16px', marginBottom: '8px' }}>
          AI-powered features (content generation, newsletter digest) are coming in Phase 2.
        </p>
        <fieldset disabled style={{ border: '1px solid var(--color-border)', borderRadius: '4px', padding: '16px' }}>
          <legend style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>Coming in Phase 2</legend>
          {['Claude (Anthropic)', 'OpenAI', 'Groq'].map(provider => (
            <label key={provider} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'not-allowed', color: 'var(--color-text-muted)' }}>
              <input type="radio" name="ai_provider" disabled />
              {provider}
            </label>
          ))}
        </fieldset>
      </Section>
    </div>
  )
}
