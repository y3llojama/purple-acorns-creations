'use client'
import { useState } from 'react'
import ImageUploader from './ImageUploader'
import type { Settings } from '@/lib/supabase/types'

interface Props { settings: Settings }

const THEMES = [
  { value: 'warm-artisan', label: 'Warm Artisan', primary: '#2d1b4e', accent: '#d4a853' },
  { value: 'soft-botanical', label: 'Soft Botanical', primary: '#9b7bb8', accent: '#f0e8f5' },
] as const

export default function BrandingEditor({ settings }: Props) {
  const [theme, setTheme] = useState(settings.theme ?? 'warm-artisan')
  const [themeSaved, setThemeSaved] = useState(false)
  const [announcementEnabled, setAnnouncementEnabled] = useState(settings.announcement_enabled)
  const [announcementText, setAnnouncementText] = useState(settings.announcement_text ?? '')
  const [announcementLinkUrl, setAnnouncementLinkUrl] = useState(settings.announcement_link_url ?? '')
  const [announcementLinkLabel, setAnnouncementLinkLabel] = useState(settings.announcement_link_label ?? '')
  const [announcementSaved, setAnnouncementSaved] = useState(false)

  async function saveTheme(t: string) {
    setTheme(t)
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: t }),
    })
    if (res.ok) setThemeSaved(true)
  }

  async function saveAnnouncement(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        announcement_enabled: announcementEnabled,
        announcement_text: announcementText,
        announcement_link_url: announcementLinkUrl,
        announcement_link_label: announcementLinkLabel,
      }),
    })
    if (res.ok) setAnnouncementSaved(true)
  }

  async function handleLogoUpload(url: string, _altText: string) {
    await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logo_url: url }),
    })
  }

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', marginBottom: '32px' }}>Branding</h1>

      {/* Theme selection */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Theme</h2>
        <div style={{ display: 'flex', gap: '16px' }}>
          {THEMES.map(t => (
            <button
              key={t.value}
              onClick={() => saveTheme(t.value)}
              aria-pressed={theme === t.value}
              style={{
                padding: '20px 28px',
                border: `3px solid ${theme === t.value ? t.primary : '#ddd'}`,
                borderRadius: '8px',
                cursor: 'pointer',
                background: '#fff',
                minWidth: '160px',
                minHeight: '80px',
              }}
            >
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: t.primary, display: 'inline-block' }} />
                <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: t.accent, display: 'inline-block' }} />
              </div>
              <div style={{ fontWeight: '600', fontSize: '14px' }}>{t.label}</div>
              {theme === t.value && <div style={{ fontSize: '12px', color: 'green', marginTop: '4px' }}>✓ Active</div>}
            </button>
          ))}
        </div>
        {themeSaved && <p role="status" aria-live="polite" style={{ color: 'green', marginTop: '8px', fontSize: '14px' }}>Theme saved ✓</p>}
      </section>

      {/* Logo */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Logo</h2>
        {settings.logo_url && (
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>Current logo set. Upload a new one to replace it.</p>
        )}
        <ImageUploader bucket="branding" onUpload={handleLogoUpload} label="Upload Logo" />
      </section>

      {/* Announcement banner */}
      <section>
        <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Announcement Banner</h2>
        <form onSubmit={saveAnnouncement}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontSize: '16px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={announcementEnabled}
              onChange={e => setAnnouncementEnabled(e.target.checked)}
              aria-label="Show announcement banner"
              style={{ width: '20px', height: '20px' }}
            />
            Show announcement banner
          </label>
          <div style={{ marginBottom: '12px' }}>
            <label htmlFor="ann-text" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Announcement Text (max 300 chars)</label>
            <input id="ann-text" value={announcementText} onChange={e => setAnnouncementText(e.target.value)} maxLength={300} style={{ width: '100%', padding: '8px', fontSize: '16px', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label htmlFor="ann-link-url" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Link URL (optional)</label>
              <input id="ann-link-url" value={announcementLinkUrl} onChange={e => setAnnouncementLinkUrl(e.target.value)} placeholder="https://..." style={{ width: '100%', padding: '8px', fontSize: '16px', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
            </div>
            <div>
              <label htmlFor="ann-link-label" style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>Link Label (optional)</label>
              <input id="ann-link-label" value={announcementLinkLabel} onChange={e => setAnnouncementLinkLabel(e.target.value)} placeholder="Learn more" style={{ width: '100%', padding: '8px', fontSize: '16px', borderRadius: '4px', border: '1px solid var(--color-border)' }} />
            </div>
          </div>
          <button type="submit" style={{ background: 'var(--color-primary)', color: 'var(--color-accent)', padding: '12px 24px', fontSize: '16px', border: 'none', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }}>
            Save Announcement
          </button>
          {announcementSaved && <span role="status" aria-live="polite" style={{ marginLeft: '12px', color: 'green' }}>Saved ✓</span>}
        </form>
      </section>
    </div>
  )
}
