'use client'
import { useState } from 'react'
import type { Newsletter, NewsletterSection, GalleryItem as FullGalleryItem } from '@/lib/supabase/types'
import { isValidHttpsUrl } from '@/lib/validate'
import GalleryPickerModal from './GalleryPickerModal'

type GalleryItem = Pick<FullGalleryItem, 'id' | 'url' | 'alt_text'>

interface Props {
  newsletter: Newsletter
  galleryItems: GalleryItem[]
  onChange: (updated: Newsletter) => void
  onNext: () => void
  onBack: () => void
}

type GalleryTarget =
  | { kind: 'hero' }
  | { kind: 'section'; index: number }

export default function EditStep({ newsletter, galleryItems, onChange, onNext, onBack }: Props) {
  const [local, setLocal] = useState<Newsletter>(newsletter)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [galleryTarget, setGalleryTarget] = useState<GalleryTarget | null>(null)

  // ── Helpers ──────────────────────────────────────────────────────────────

  function updateField<K extends keyof Newsletter>(key: K, value: Newsletter[K]) {
    setLocal((prev) => ({ ...prev, [key]: value }))
  }

  function updateSection(index: number, patch: Partial<NewsletterSection>) {
    setLocal((prev) => {
      const sections = [...prev.content]
      sections[index] = { ...sections[index], ...patch } as NewsletterSection
      return { ...prev, content: sections }
    })
  }

  function addSection(type: NewsletterSection['type']) {
    setLocal((prev) => {
      let newSection: NewsletterSection
      if (type === 'text') newSection = { type: 'text', body: '' }
      else if (type === 'image') newSection = { type: 'image', image_url: '', caption: undefined }
      else newSection = { type: 'cta', url: '', label: '' }
      return { ...prev, content: [...prev.content, newSection] }
    })
  }

  function removeSection(index: number) {
    setLocal((prev) => {
      const sections = [...prev.content]
      sections.splice(index, 1)
      return { ...prev, content: sections }
    })
  }

  function moveSection(index: number, direction: -1 | 1) {
    setLocal((prev) => {
      const sections = [...prev.content]
      const target = index + direction
      if (target < 0 || target >= sections.length) return prev
      ;[sections[index], sections[target]] = [sections[target], sections[index]]
      return { ...prev, content: sections }
    })
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function save(current: Newsletter): Promise<Newsletter | null> {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/newsletter/${current.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: current.title,
          teaser_text: current.teaser_text,
          hero_image_url: current.hero_image_url,
          content: current.content,
          tone: current.tone,
          subject_line: current.subject_line,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body?.error ?? `Save failed (${res.status})`)
        return null
      }
      const body = await res.json()
      const updated: Newsletter = body.newsletter ?? body
      setLocal(updated)
      onChange(updated)
      return updated
    } catch {
      setError('Network error — please try again')
      return null
    } finally {
      setSaving(false)
    }
  }

  async function handleSave() {
    await save(local)
  }

  async function handleSaveAndContinue() {
    const updated = await save(local)
    if (updated) onNext()
  }

  function handleBlur() {
    save(local)
  }

  // ── Gallery picker ────────────────────────────────────────────────────────

  function handleGalleryPick(url: string) {
    if (!galleryTarget) return
    if (galleryTarget.kind === 'hero') {
      setLocal((prev) => ({ ...prev, hero_image_url: url }))
    } else {
      updateSection(galleryTarget.index, { image_url: url } as Partial<NewsletterSection>)
    }
    setGalleryTarget(null)
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    fontSize: '14px',
    color: 'var(--color-text)',
    background: 'var(--color-bg)',
    boxSizing: 'border-box',
    minHeight: '48px',
  }

  const buttonStyle: React.CSSProperties = {
    padding: '10px 16px',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    minHeight: '48px',
    background: 'var(--color-surface)',
    color: 'var(--color-text)',
    whiteSpace: 'nowrap',
  }

  const iconButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    padding: '0',
    minWidth: '40px',
    minHeight: '40px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
  }

  function renderSection(section: NewsletterSection, index: number) {
    const isFirst = index === 0
    const isLast = index === local.content.length - 1

    return (
      <div
        key={index}
        style={{
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '12px',
          background: 'var(--color-surface)',
        }}
      >
        {/* Section header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <span style={{
            fontSize: '11px',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-text-muted)',
            padding: '2px 8px',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
          }}>
            {section.type}
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              style={{ ...iconButtonStyle, opacity: isFirst ? 0.4 : 1 }}
              disabled={isFirst}
              onClick={() => moveSection(index, -1)}
              aria-label="Move section up"
              title="Move up"
            >
              ↑
            </button>
            <button
              style={{ ...iconButtonStyle, opacity: isLast ? 0.4 : 1 }}
              disabled={isLast}
              onClick={() => moveSection(index, 1)}
              aria-label="Move section down"
              title="Move down"
            >
              ↓
            </button>
            <button
              style={{ ...iconButtonStyle, color: 'var(--color-error, #c00)', borderColor: 'var(--color-error, #c00)' }}
              onClick={() => removeSection(index)}
              aria-label="Delete section"
              title="Delete section"
            >
              ×
            </button>
          </div>
        </div>

        {/* Section fields */}
        {section.type === 'text' && (
          <textarea
            value={section.body}
            onChange={(e) => updateSection(index, { body: e.target.value })}
            onBlur={handleBlur}
            placeholder="Section body text…"
            rows={5}
            style={{ ...inputStyle, minHeight: '120px', resize: 'vertical' }}
          />
        )}

        {section.type === 'image' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <input
                type="url"
                value={section.image_url}
                onChange={(e) => updateSection(index, { image_url: e.target.value })}
                onBlur={handleBlur}
                placeholder="https://… image URL"
                style={inputStyle}
              />
              <button
                style={buttonStyle}
                onClick={() => setGalleryTarget({ kind: 'section', index })}
                type="button"
              >
                Pick from gallery
              </button>
            </div>
            {section.image_url && !isValidHttpsUrl(section.image_url) && (
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-error, #c00)' }}>
                URL must start with https://
              </p>
            )}
            <input
              type="text"
              value={section.caption ?? ''}
              onChange={(e) => updateSection(index, { caption: e.target.value || undefined })}
              onBlur={handleBlur}
              placeholder="Caption (optional)"
              style={inputStyle}
            />
          </div>
        )}

        {section.type === 'cta' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input
              type="url"
              value={section.url}
              onChange={(e) => updateSection(index, { url: e.target.value })}
              onBlur={handleBlur}
              placeholder="https://… CTA URL"
              style={inputStyle}
            />
            <input
              type="text"
              value={section.label}
              onChange={(e) => updateSection(index, { label: e.target.value })}
              onBlur={handleBlur}
              placeholder="Button label"
              style={inputStyle}
            />
          </div>
        )}
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: '24px', fontSize: '22px', fontWeight: 700, color: 'var(--color-text)' }}>
        Edit &amp; Photos
      </h2>

      {/* Title */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '14px', color: 'var(--color-text)' }}>
          Title
        </label>
        <input
          type="text"
          value={local.title}
          onChange={(e) => updateField('title', e.target.value)}
          onBlur={handleBlur}
          placeholder="Newsletter title"
          style={inputStyle}
        />
      </div>

      {/* Hero image URL */}
      <div style={{ marginBottom: '24px' }}>
        <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '14px', color: 'var(--color-text)' }}>
          Hero Image URL
        </label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <input
            type="url"
            value={local.hero_image_url ?? ''}
            onChange={(e) => updateField('hero_image_url', e.target.value || null)}
            onBlur={handleBlur}
            placeholder="https://… hero image URL"
            style={inputStyle}
          />
          <button
            style={buttonStyle}
            onClick={() => setGalleryTarget({ kind: 'hero' })}
            type="button"
          >
            Pick from gallery
          </button>
        </div>
        {local.hero_image_url && !isValidHttpsUrl(local.hero_image_url) && (
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--color-error, #c00)' }}>
            URL must start with https://
          </p>
        )}
      </div>

      {/* Sections */}
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 600, color: 'var(--color-text)' }}>
          Sections
        </h3>
        {local.content.length === 0 && (
          <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginBottom: '12px' }}>
            No sections yet. Add one below.
          </p>
        )}
        {local.content.map((section, i) => renderSection(section, i))}
      </div>

      {/* Add section buttons */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <button style={buttonStyle} onClick={() => addSection('text')} type="button">
          + Text
        </button>
        <button style={buttonStyle} onClick={() => addSection('image')} type="button">
          + Image
        </button>
        <button style={buttonStyle} onClick={() => addSection('cta')} type="button">
          + CTA
        </button>
      </div>

      {/* Error */}
      {error && (
        <p style={{ color: 'var(--color-error, #c00)', fontSize: '14px', marginBottom: '12px' }}>
          {error}
        </p>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <button
          style={{ ...buttonStyle, minWidth: '100px' }}
          onClick={onBack}
          type="button"
          disabled={saving}
        >
          ← Back
        </button>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            style={{ ...buttonStyle, minWidth: '80px' }}
            onClick={handleSave}
            type="button"
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            style={{
              ...buttonStyle,
              background: 'var(--color-primary)',
              color: 'var(--color-bg)',
              border: 'none',
              minWidth: '180px',
              fontWeight: 600,
            }}
            onClick={handleSaveAndContinue}
            type="button"
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save & Continue →'}
          </button>
        </div>
      </div>

      {/* Gallery picker modal */}
      {galleryTarget && (
        <GalleryPickerModal
          items={galleryItems}
          onPick={handleGalleryPick}
          onClose={() => setGalleryTarget(null)}
        />
      )}
    </div>
  )
}
