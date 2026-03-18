'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ImageUploader from './ImageUploader'
import SiteMap from './SiteMap'
import { deriveCustomThemeVars } from '@/lib/color'
import type { ThemeVars } from '@/lib/color'
import type { Settings } from '@/lib/supabase/types'

interface Props { settings: Settings }

type NamedTheme = 'warm-artisan' | 'soft-botanical'
type Preset =
  | { name: string; theme: NamedTheme; primary: string; accent: string }
  | { name: string; theme: 'custom'; primary: string; accent: string }

const PRESETS: Preset[] = [
  { name: 'Warm Artisan',   theme: 'warm-artisan',   primary: '#2d1b4e', accent: '#d4a853' },
  { name: 'Soft Botanical', theme: 'soft-botanical',  primary: '#3d2b4e', accent: '#9b7bb8' },
  { name: 'Forest Dusk',    theme: 'custom',          primary: '#1a3d2b', accent: '#c8a86b' },
  { name: 'Rose & Rust',    theme: 'custom',          primary: '#6b1a2e', accent: '#d4916b' },
  { name: 'Midnight Ink',   theme: 'custom',          primary: '#1a2040', accent: '#8bb4d4' },
  { name: 'Mauve Bloom',    theme: 'custom',          primary: '#3d1a2e', accent: '#e8a0c0' },
  { name: 'Harvest Gold',   theme: 'custom',          primary: '#3d2800', accent: '#e8c060' },
  { name: 'Slate & Sage',   theme: 'custom',          primary: '#2e3d35', accent: '#9fb89f' },
]

const PREVIEW_STRIP_VARS: Array<keyof ThemeVars> = [
  '--color-bg', '--color-surface', '--color-primary', '--color-accent', '--color-text', '--color-text-muted',
]

function initPreset(settings: Settings): Preset {
  if (settings.theme === 'warm-artisan' || settings.theme === 'soft-botanical') {
    return PRESETS.find(p => p.theme === settings.theme) ?? PRESETS[0]
  }
  if (settings.theme === 'custom' && settings.custom_primary && settings.custom_accent) {
    const match = PRESETS.find(p => p.primary === settings.custom_primary && p.accent === settings.custom_accent)
    if (match) return match
    return { name: 'Custom', theme: 'custom', primary: settings.custom_primary, accent: settings.custom_accent }
  }
  return PRESETS[0]
}

function safeDerive(primary: string, accent: string): ThemeVars | null {
  try { return deriveCustomThemeVars(primary, accent) } catch { return null }
}

export default function BrandingEditor({ settings }: Props) {
  const router = useRouter()
  const [selectedPreset, setSelectedPreset] = useState<Preset>(() => initPreset(settings))
  const [pickerPrimary, setPickerPrimary]   = useState(selectedPreset.primary)
  const [pickerAccent, setPickerAccent]     = useState(selectedPreset.accent)
  const [previewVars, setPreviewVars]       = useState<ThemeVars | null>(() => safeDerive(selectedPreset.primary, selectedPreset.accent))
  const [themeSaved, setThemeSaved]         = useState(false)
  const [themeError, setThemeError]         = useState<string | null>(null)

  const [announcementEnabled, setAnnouncementEnabled]     = useState(settings.announcement_enabled)
  const [announcementText, setAnnouncementText]           = useState(settings.announcement_text ?? '')
  const [announcementLinkUrl, setAnnouncementLinkUrl]     = useState(settings.announcement_link_url ?? '')
  const [announcementLinkLabel, setAnnouncementLinkLabel] = useState(settings.announcement_link_label ?? '')
  const [announcementSaved, setAnnouncementSaved]         = useState(false)

  function applyThemePreview(preset: Preset) {
    const html = document.documentElement
    // CSSStyleDeclaration doesn't enumerate custom properties via Object.keys,
    // so remove them explicitly by known key names.
    const allVarKeys: Array<keyof ThemeVars> = [
      '--color-primary', '--color-accent', '--color-bg', '--color-surface',
      '--color-text', '--color-text-muted', '--color-border', '--color-secondary', '--color-focus',
    ]
    if (preset.theme === 'warm-artisan' || preset.theme === 'soft-botanical') {
      html.setAttribute('data-theme', preset.theme)
      for (const key of allVarKeys) html.style.removeProperty(key)
    } else {
      html.setAttribute('data-theme', 'custom')
      const vars = safeDerive(preset.primary, preset.accent)
      if (vars) {
        for (const [k, v] of Object.entries(vars)) html.style.setProperty(k, v)
      }
    }
  }

  function handlePresetClick(preset: Preset) {
    setSelectedPreset(preset)
    setPickerPrimary(preset.primary)
    setPickerAccent(preset.accent)
    setPreviewVars(safeDerive(preset.primary, preset.accent))
    setThemeSaved(false)
    setThemeError(null)
    applyThemePreview(preset)
    // Auto-save preset selection
    const body = preset.theme === 'warm-artisan' || preset.theme === 'soft-botanical'
      ? { theme: preset.theme, custom_primary: null, custom_accent: null }
      : { theme: 'custom', custom_primary: preset.primary, custom_accent: preset.accent }
    fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(res => {
      if (res.ok) { setThemeSaved(true); router.refresh() }
      else res.json().catch(() => ({})).then(d => setThemeError(`Save failed (${res.status}): ${d.error ?? res.statusText}`))
    })
  }

  function handlePickerChange(primary: string, accent: string) {
    setPickerPrimary(primary)
    setPickerAccent(accent)
    const match = PRESETS.find(p => p.primary === primary && p.accent === accent)
    const preset = match ?? { name: 'Custom', theme: 'custom' as const, primary, accent }
    setSelectedPreset(preset)
    setPreviewVars(safeDerive(primary, accent))
    setThemeSaved(false)
    applyThemePreview(preset)
  }

  async function saveTheme() {
    setThemeError(null)
    const body = selectedPreset.theme === 'warm-artisan' || selectedPreset.theme === 'soft-botanical'
      ? { theme: selectedPreset.theme, custom_primary: null, custom_accent: null }
      : { theme: 'custom', custom_primary: pickerPrimary, custom_accent: pickerAccent }
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      setThemeSaved(true)
      router.refresh()
    } else {
      const data = await res.json().catch(() => ({}))
      setThemeError(`Save failed (${res.status}): ${data.error ?? res.statusText}`)
    }
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
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logo_url: url }),
    })
    if (!res.ok) console.error('[BrandingEditor] Failed to save logo URL')
  }

  async function handleHeroUpload(url: string, _altText: string) {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hero_image_url: url }),
    })
    if (!res.ok) console.error('[BrandingEditor] Failed to save hero image URL')
  }

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', marginBottom: '32px' }}>Branding</h1>

      {/* Theme */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '20px', marginBottom: '6px' }}>Theme</h2>
        <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '20px' }}>
          Choose a preset or set your own colors. The site updates for all visitors after saving.
        </p>

        {/* Preset grid */}
        <div style={{ marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--color-text-muted)' }}>Presets</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 80px)', gap: '10px', marginBottom: '24px' }}>
          {PRESETS.map(preset => {
            const isActive = selectedPreset.name === preset.name
            return (
              <button
                key={preset.name}
                onClick={() => handlePresetClick(preset)}
                aria-pressed={isActive}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  cursor: 'pointer', textAlign: 'center', minHeight: '48px',
                }}
              >
                <div style={{
                  border: `3px solid ${isActive ? preset.primary : '#ddd'}`,
                  borderRadius: '8px', overflow: 'hidden', marginBottom: '4px',
                }}>
                  <div style={{ height: '28px', background: preset.primary }} />
                  <div style={{ height: '28px', background: preset.accent }} />
                </div>
                <span style={{ fontSize: '10px', color: isActive ? preset.primary : '#888', fontWeight: isActive ? 700 : 400 }}>
                  {preset.name}{isActive ? <span aria-hidden="true"> ✓</span> : ''}
                </span>
              </button>
            )
          })}
        </div>

        {/* Custom pickers */}
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '20px', marginBottom: '16px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--color-text-muted)', display: 'block', marginBottom: '14px' }}>
            Custom Colors
          </span>
          <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="picker-primary" style={{ fontSize: '13px', fontWeight: 500 }}>Primary</label>
              <input
                id="picker-primary"
                type="color"
                value={pickerPrimary}
                onChange={e => handlePickerChange(e.target.value, pickerAccent)}
                style={{ width: '44px', height: '44px', border: '2px solid var(--color-border)', borderRadius: '6px', cursor: 'pointer', padding: '2px' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="picker-accent" style={{ fontSize: '13px', fontWeight: 500 }}>Accent</label>
              <input
                id="picker-accent"
                type="color"
                value={pickerAccent}
                onChange={e => handlePickerChange(pickerPrimary, e.target.value)}
                style={{ width: '44px', height: '44px', border: '2px solid var(--color-border)', borderRadius: '6px', cursor: 'pointer', padding: '2px' }}
              />
            </div>

            {/* Preview strip */}
            {previewVars && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '13px', fontWeight: 500 }}>Preview</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {PREVIEW_STRIP_VARS.map(key => (
                    <div
                      key={key}
                      title={key}
                      style={{ width: '24px', height: '44px', borderRadius: '3px', background: previewVars[key], border: '1px solid #ddd' }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '10px' }}>
            Tip: Primary is used for headings and borders. Accent is used for highlights and buttons.
          </p>
        </div>

        <button
          onClick={saveTheme}
          style={{ background: 'var(--color-primary)', color: 'var(--color-accent)', padding: '12px 24px', fontSize: '16px', border: 'none', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }}
        >
          Save Theme
        </button>
        {themeSaved && <span role="status" aria-live="polite" style={{ marginLeft: '12px', color: 'green' }}>Saved ✓</span>}
        {themeError && <span role="alert" style={{ marginLeft: '12px', color: 'red' }}>{themeError}</span>}
      </section>

      {/* Logo */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Logo</h2>
        <SiteMap highlight="header" label="Site Header" description="Your logo appears in the top-left corner of every page." />
        {settings.logo_url && (
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>Current logo set. Upload a new one to replace it.</p>
        )}
        <ImageUploader bucket="branding" onUpload={handleLogoUpload} label="Upload Logo" />
      </section>

      {/* Hero Image */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Hero Image</h2>
        <SiteMap highlight="hero" label="Hero Section" description="Full-width background image on the homepage hero." />
        {settings.hero_image_url && (
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>Current hero image set. Upload a new one to replace it.</p>
        )}
        <ImageUploader bucket="branding" onUpload={handleHeroUpload} label="Upload Hero Image" />
      </section>

      {/* Announcement banner */}
      <section>
        <h2 style={{ fontSize: '20px', marginBottom: '16px' }}>Announcement Banner</h2>
        <SiteMap highlight="announcement" label="Announcement Bar" description="Slim banner displayed above the header on every page." />
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
