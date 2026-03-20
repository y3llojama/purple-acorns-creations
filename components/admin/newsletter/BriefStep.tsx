'use client'

import { useState } from 'react'
import type { Newsletter, NewsletterTone } from '@/lib/supabase/types'

interface UpcomingEvent {
  name: string
  date: string
  location: string
}

interface Props {
  newsletter: Newsletter
  upcomingEvents: UpcomingEvent[]
  hasAi: boolean
  onDraftGenerated: (updated: Newsletter) => void
  onNext: () => void
}

const TONE_OPTIONS: { value: NewsletterTone; label: string }[] = [
  { value: 'upbeat', label: 'Friendly' },
  { value: 'excited', label: 'Playful' },
  { value: 'neutral', label: 'Professional' },
  { value: 'celebratory', label: 'Inspiring' },
  { value: 'reflective', label: 'Reflective' },
  { value: 'sombre', label: 'Sombre' },
]

export default function BriefStep({ newsletter, upcomingEvents, hasAi, onDraftGenerated, onNext }: Props) {
  const [title, setTitle] = useState(newsletter.title ?? '')
  const [teaserText, setTeaserText] = useState(newsletter.teaser_text ?? '')
  const [tone, setTone] = useState<NewsletterTone>(newsletter.tone ?? 'upbeat')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedNewsletter, setSavedNewsletter] = useState<Newsletter | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSavedNewsletter(null)
    setLoading(true)

    try {
      // Step 1: Save brief
      const saveRes = await fetch(`/api/admin/newsletter/${newsletter.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, teaser_text: teaserText, tone }),
      })

      if (!saveRes.ok) {
        const data = await saveRes.json().catch(() => ({}))
        setError(data.error ?? `Save failed (${saveRes.status})`)
        return
      }

      const savedData = await saveRes.json()
      let updatedNewsletter: Newsletter = savedData.newsletter ?? savedData

      // Step 2: Generate AI draft if available
      if (hasAi) {
        const genRes = await fetch(`/api/admin/newsletter/${newsletter.id}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tone, upcoming_events: upcomingEvents }),
        })

        if (!genRes.ok) {
          const data = await genRes.json().catch(() => ({}))
          setError(data.error ?? `AI generation failed (${genRes.status})`)
          setSavedNewsletter(updatedNewsletter)
          return
        }

        const genData = await genRes.json()
        updatedNewsletter = genData.newsletter ?? genData
      }

      onDraftGenerated(updatedNewsletter)
      onNext()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  function handleContinueWithoutAi() {
    if (savedNewsletter) {
      onDraftGenerated(savedNewsletter)
      onNext()
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    minHeight: '48px',
    padding: '12px 16px',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    background: 'var(--color-surface)',
    color: 'var(--color-text)',
    fontSize: '15px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--color-text)',
    marginBottom: '6px',
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h2 style={{ margin: '0 0 4px 0', fontFamily: 'var(--font-display)', color: 'var(--color-text)', fontSize: '22px' }}>
          Newsletter Brief
        </h2>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '14px' }}>
          Set the title, teaser and tone for this newsletter.
        </p>
      </div>

      {/* Title */}
      <div>
        <label htmlFor="brief-title" style={labelStyle}>Title</label>
        <input
          id="brief-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Spring Collection Drop"
          required
          style={inputStyle}
        />
      </div>

      {/* Teaser text */}
      <div>
        <label htmlFor="brief-teaser" style={labelStyle}>Teaser Text</label>
        <textarea
          id="brief-teaser"
          value={teaserText}
          onChange={(e) => setTeaserText(e.target.value)}
          placeholder="A short preview shown in email clients…"
          rows={3}
          style={{ ...inputStyle, minHeight: '96px', resize: 'vertical' }}
        />
      </div>

      {/* Tone */}
      <div>
        <label htmlFor="brief-tone" style={labelStyle}>Tone</label>
        <select
          id="brief-tone"
          value={tone}
          onChange={(e) => setTone(e.target.value as NewsletterTone)}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          {TONE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Upcoming events */}
      <div>
        <p style={{ ...labelStyle, marginBottom: '10px' }}>Upcoming Events (AI context)</p>
        {upcomingEvents.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
            No upcoming events
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {upcomingEvents.map((ev, i) => (
              <li
                key={i}
                style={{
                  padding: '10px 14px',
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  color: 'var(--color-text)',
                }}
              >
                <strong>{ev.name}</strong>
                <span style={{ color: 'var(--color-text-muted)', marginLeft: '8px' }}>
                  {ev.date} &mdash; {ev.location}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
          {savedNewsletter && (
            <button
              type="button"
              onClick={handleContinueWithoutAi}
              style={{
                alignSelf: 'flex-start',
                padding: '10px 20px',
                fontSize: '14px',
                background: 'transparent',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                cursor: 'pointer',
                minHeight: '44px',
              }}
            >
              Continue without AI →
            </button>
          )}
        </div>
      )}

      {/* Submit button */}
      <div>
        <button
          type="submit"
          disabled={loading || !title.trim()}
          style={{
            minHeight: '48px',
            padding: '12px 28px',
            background: loading || !title.trim() ? 'var(--color-border)' : 'var(--color-primary)',
            color: loading || !title.trim() ? 'var(--color-text-muted)' : 'var(--color-bg)',
            border: 'none',
            borderRadius: '6px',
            fontSize: '15px',
            fontWeight: 600,
            cursor: loading || !title.trim() ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            transition: 'background 0.15s',
          }}
        >
          {loading
            ? hasAi ? 'Generating…' : 'Saving…'
            : hasAi
              ? 'Save & Generate AI Draft'
              : 'Save & Continue'}
        </button>
      </div>
    </form>
  )
}
