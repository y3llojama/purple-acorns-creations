'use client'

import { useState, useEffect } from 'react'
import type { Newsletter } from '@/lib/supabase/types'

interface Props {
  newsletter: Newsletter
  defaultSendTime: string
  hasResend: boolean
  onChange: (updated: Newsletter) => void
  onBack: () => void
}

interface Analytics {
  sent_count: number
  open_rate: number
  click_rate: number
  unsubscribes: number
}

function getTomorrowDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

function formatScheduledDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

export default function SendStep({ newsletter, defaultSendTime, hasResend, onChange, onBack }: Props) {
  const [sendDate, setSendDate] = useState(getTomorrowDate())
  const [sendTime, setSendTime] = useState(defaultSendTime)
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  const isSent = newsletter.status === 'sent' || newsletter.status === 'scheduled'
  const confirmationValid = confirmation === 'SEND NEWSLETTER'
  const canSend = hasResend && confirmationValid && !loading

  useEffect(() => {
    if (!isSent) return
    setAnalyticsLoading(true)
    fetch(`/api/admin/newsletter/${newsletter.id}/analytics`)
      .then((res) => {
        if (!res.ok) return null
        return res.json()
      })
      .then((data) => {
        if (data) setAnalytics(data)
      })
      .catch(() => null)
      .finally(() => setAnalyticsLoading(false))
  }, [newsletter.id, isSent])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!canSend) return

    setError(null)
    setLoading(true)

    const scheduledAt = new Date(`${sendDate}T${sendTime}:00`).toISOString()

    try {
      const res = await fetch(`/api/admin/newsletter/${newsletter.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'SEND NEWSLETTER', scheduled_at: scheduledAt }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? `Send failed (${res.status})`)
        return
      }

      const formattedDate = formatScheduledDate(scheduledAt)
      setSuccessMessage(`Scheduled! Newsletter will send on ${formattedDate}.`)
      onChange({ ...newsletter, status: 'scheduled', scheduled_at: scheduledAt })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
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

  const buttonStyle: React.CSSProperties = {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Section heading */}
      <div>
        <h2 style={{ margin: '0 0 4px 0', fontFamily: 'var(--font-display)', color: 'var(--color-text)', fontSize: '22px' }}>
          Schedule &amp; Send
        </h2>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '14px' }}>
          Choose when to send <strong>{newsletter.title}</strong>.
        </p>
      </div>

      {/* Resend warning */}
      {!hasResend && (
        <div
          role="alert"
          style={{
            padding: '14px 18px',
            background: '#fdf0f0',
            border: '1px solid #c0392b',
            borderRadius: '6px',
            color: '#c0392b',
            fontSize: '14px',
          }}
        >
          Resend is not configured. Go to <strong>Admin &rarr; Integrations</strong> to add your API key.
        </div>
      )}

      {/* Success message */}
      {successMessage && (
        <div
          role="status"
          style={{
            padding: '14px 18px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-accent)',
            borderRadius: '6px',
            color: 'var(--color-text)',
            fontSize: '14px',
          }}
        >
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Date & time pickers */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <label htmlFor="send-date" style={labelStyle}>Send Date</label>
            <input
              id="send-date"
              type="date"
              value={sendDate}
              min={getTomorrowDate()}
              onChange={(e) => setSendDate(e.target.value)}
              required
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="send-time" style={labelStyle}>Send Time</label>
            <input
              id="send-time"
              type="time"
              value={sendTime}
              onChange={(e) => setSendTime(e.target.value)}
              required
              style={inputStyle}
            />
          </div>
        </div>

        {/* Confirmation field */}
        <div>
          <label htmlFor="send-confirm" style={labelStyle}>
            Type <code style={{ background: 'var(--color-bg)', padding: '2px 6px', borderRadius: '4px', fontSize: '13px' }}>SEND NEWSLETTER</code> to confirm
          </label>
          <input
            id="send-confirm"
            type="text"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder="SEND NEWSLETTER"
            autoComplete="off"
            style={{
              ...inputStyle,
              borderColor: confirmation.length > 0 && !confirmationValid ? '#c0392b' : 'var(--color-border)',
            }}
          />
          {confirmation.length > 0 && !confirmationValid && (
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#c0392b' }}>
              Must type exactly: SEND NEWSLETTER
            </p>
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

        {/* Buttons */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between' }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              ...buttonStyle,
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border)',
            }}
          >
            &larr; Back
          </button>
          <button
            type="submit"
            disabled={!canSend}
            style={{
              ...buttonStyle,
              background: canSend ? 'var(--color-primary)' : 'var(--color-border)',
              color: canSend ? 'var(--color-bg)' : 'var(--color-text-muted)',
              cursor: canSend ? 'pointer' : 'not-allowed',
            }}
          >
            {loading ? 'Scheduling…' : 'Schedule Send'}
          </button>
        </div>
      </form>

      {/* Analytics panel — shown when newsletter has been sent/scheduled */}
      {isSent && (
        <div style={{
          marginTop: '8px',
          padding: '20px 24px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontFamily: 'var(--font-display)', fontSize: '17px', color: 'var(--color-text)' }}>
            Analytics
          </h3>

          {analyticsLoading ? (
            <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '14px' }}>Loading analytics…</p>
          ) : analytics ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '16px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'var(--font-display)' }}>
                  {analytics.sent_count.toLocaleString()}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Sent</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'var(--font-display)' }}>
                  {(analytics.open_rate * 100).toFixed(1)}%
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Open Rate</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'var(--font-display)' }}>
                  {(analytics.click_rate * 100).toFixed(1)}%
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Click Rate</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'var(--font-display)' }}>
                  {analytics.unsubscribes.toLocaleString()}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Unsubscribes</div>
              </div>
            </div>
          ) : (
            <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '14px' }}>Analytics not available yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
