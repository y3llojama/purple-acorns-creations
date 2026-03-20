'use client'

import { useState } from 'react'
import type { Newsletter, NewsletterSection } from '@/lib/supabase/types'

interface Props {
  newsletter: Newsletter
  onRegenerated: (updated: Newsletter) => void
  onNext: () => void
  onBack: () => void
}

function isValidHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function truncate(str: string, max = 300): string {
  if (str.length <= max) return str
  return str.slice(0, max) + '…'
}

function SectionPreview({ section }: { section: NewsletterSection }) {
  if (section.type === 'text') {
    return (
      <div
        style={{
          padding: '14px 16px',
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: '6px',
          fontSize: '14px',
          color: 'var(--color-text)',
          lineHeight: '1.6',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
          Text section
        </span>
        {truncate(section.body)}
      </div>
    )
  }

  if (section.type === 'image') {
    const validUrl = isValidHttpsUrl(section.image_url)
    return (
      <div
        style={{
          padding: '14px 16px',
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '14px',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', minWidth: '70px' }}>
          Image
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {validUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={section.image_url}
              alt={section.caption ?? 'Newsletter image'}
              width={40}
              height={40}
              style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--color-border)', flexShrink: 0 }}
            />
          ) : (
            <div
              style={{
                width: '40px', height: '40px', borderRadius: '4px',
                background: 'var(--color-border)', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '10px', color: 'var(--color-text-muted)',
              }}
            >
              ?
            </div>
          )}
          {section.caption && (
            <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{section.caption}</span>
          )}
        </div>
      </div>
    )
  }

  if (section.type === 'cta') {
    return (
      <div
        style={{
          padding: '14px 16px',
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '70px' }}>
          CTA
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            background: 'var(--color-accent)',
            color: 'var(--color-bg)',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          {section.label}
        </span>
        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', wordBreak: 'break-all' }}>
          {section.url}
        </span>
      </div>
    )
  }

  return null
}

export default function DraftStep({ newsletter, onRegenerated, onNext, onBack }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRegenerate() {
    setError(null)
    setLoading(true)

    try {
      const res = await fetch(`/api/admin/newsletter/${newsletter.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? `Regeneration failed (${res.status})`)
        return
      }

      const data = await res.json()
      const updated: Newsletter = data.newsletter ?? data
      onRegenerated(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  const hasContent = Array.isArray(newsletter.content) && newsletter.content.length > 0

  const buttonBase: React.CSSProperties = {
    minHeight: '48px',
    padding: '12px 24px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 0.15s',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 style={{ margin: '0 0 4px 0', fontFamily: 'var(--font-display)', color: 'var(--color-text)', fontSize: '22px' }}>
          AI Draft Review
        </h2>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '14px' }}>
          Review the generated draft before editing.
        </p>
      </div>

      {/* Title */}
      <div>
        <p style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>Title</p>
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            fontSize: '15px',
            color: 'var(--color-text)',
            fontWeight: 500,
          }}
        >
          {newsletter.title || <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No title set</span>}
        </div>
      </div>

      {/* Teaser text */}
      <div>
        <p style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>Teaser Text</p>
        <div
          style={{
            padding: '12px 16px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            fontSize: '14px',
            color: 'var(--color-text)',
            lineHeight: '1.5',
          }}
        >
          {newsletter.teaser_text || <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No teaser set</span>}
        </div>
      </div>

      {/* Content sections */}
      <div>
        <p style={{ margin: '0 0 10px 0', fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>
          Content Sections
        </p>
        {hasContent ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {newsletter.content.map((section, i) => (
              <SectionPreview key={i} section={section} />
            ))}
          </div>
        ) : (
          <div
            style={{
              padding: '20px 16px',
              background: 'var(--color-bg)',
              border: '1px dashed var(--color-border)',
              borderRadius: '6px',
              textAlign: 'center',
              color: 'var(--color-text-muted)',
              fontSize: '14px',
              fontStyle: 'italic',
            }}
          >
            No draft content yet
          </div>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div
          role="alert"
          style={{
            padding: '12px 16px',
            background: '#fdf0f0',
            border: '1px solid #c0392b',
            borderRadius: '6px',
            color: '#c0392b',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}

      {/* Regenerate button */}
      <div>
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={loading}
          style={{
            ...buttonBase,
            background: loading ? 'var(--color-border)' : 'var(--color-surface)',
            color: loading ? 'var(--color-text-muted)' : 'var(--color-text)',
            border: '1px solid var(--color-border)',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Regenerating…' : 'Regenerate'}
        </button>
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid var(--color-border)' }}>
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          style={{
            ...buttonBase,
            background: 'transparent',
            color: loading ? 'var(--color-text-muted)' : 'var(--color-text)',
            border: '1px solid var(--color-border)',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          &larr; Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={loading}
          style={{
            ...buttonBase,
            background: loading ? 'var(--color-border)' : 'var(--color-primary)',
            color: loading ? 'var(--color-text-muted)' : 'var(--color-bg)',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          Looks good, continue &rarr;
        </button>
      </div>
    </div>
  )
}
