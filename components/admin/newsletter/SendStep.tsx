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

function getCountdown(scheduledAt: string): string {
  const diff = new Date(scheduledAt).getTime() - Date.now()
  if (diff <= 0) return 'Sending soon…'
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export default function SendStep({ newsletter, defaultSendTime, hasResend, onChange, onBack }: Props) {
  const [sendDate, setSendDate] = useState(getTomorrowDate())
  const [sendTime, setSendTime] = useState(defaultSendTime)
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)
  const [, setTick] = useState(0)

  const isScheduled = newsletter.status === 'scheduled'
  const isSentFinal = newsletter.status === 'sent'
  const confirmationValid = confirmation === 'SEND NEWSLETTER'
  const canSend = hasResend && confirmationValid && !loading

  // Re-render every minute to keep countdown fresh
  useEffect(() => {
    if (!isScheduled) return
    const id = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [isScheduled])

  useEffect(() => {
    if (!isSentFinal) return
    setAnalyticsLoading(true)
    fetch(`/api/admin/newsletter/${newsletter.id}/analytics`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data) setAnalytics(data) })
      .catch(() => null)
      .finally(() => setAnalyticsLoading(false))
  }, [newsletter.id, isSentFinal])

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
      setConfirmation('')
      onChange({ ...newsletter, status: 'scheduled', scheduled_at: scheduledAt })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    setCancelling(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/newsletter/${newsletter.id}/cancel`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Cancel failed')
        return
      }
      onChange({ ...newsletter, status: 'draft', scheduled_at: null })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setCancelling(false)
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

      {/* Scheduled status card */}
      {isScheduled && newsletter.scheduled_at && (
        <div style={{
          padding: '20px 24px',
          background: 'var(--color-surface)',
          border: '2px solid var(--color-accent)',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-accent)', marginBottom: '4px' }}>
                Scheduled
              </div>
              <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text)' }}>
                {formatScheduledDate(newsletter.scheduled_at)}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                Sending in <strong>{getCountdown(newsletter.scheduled_at)}</strong>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              style={{
                ...buttonStyle,
                background: 'transparent',
                color: 'var(--color-danger)',
                border: '1px solid var(--color-danger)',
                fontSize: '13px',
                padding: '8px 16px',
                minHeight: '40px',
                cursor: cancelling ? 'not-allowed' : 'pointer',
              }}
            >
              {cancelling ? 'Cancelling…' : 'Cancel scheduled send'}
            </button>
          </div>

          <div style={{
            padding: '10px 14px',
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            fontSize: '13px',
            color: 'var(--color-text-muted)',
          }}>
            A preview of this newsletter was sent to your admin email(s) when you scheduled it — check your inbox to review it before it goes out.
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div role="alert" style={{ padding: '12px 16px', background: '#fdf0f0', border: '1px solid #c0392b', borderRadius: '6px', color: '#c0392b', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {/* Schedule form — shown when not yet scheduled or sent */}
      {!isScheduled && !isSentFinal && (
        <>
          {!hasResend && (
            <div role="alert" style={{ padding: '14px 18px', background: '#fdf0f0', border: '1px solid #c0392b', borderRadius: '6px', color: '#c0392b', fontSize: '14px' }}>
              Resend is not configured. Go to <strong>Admin &rarr; Integrations</strong> to add your API key.
            </div>
          )}

          <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label htmlFor="send-date" style={labelStyle}>Send Date</label>
                <input id="send-date" type="date" value={sendDate} min={getTomorrowDate()} onChange={(e) => setSendDate(e.target.value)} required style={inputStyle} />
              </div>
              <div>
                <label htmlFor="send-time" style={labelStyle}>Send Time</label>
                <input id="send-time" type="time" value={sendTime} onChange={(e) => setSendTime(e.target.value)} required style={inputStyle} />
              </div>
            </div>

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
                style={{ ...inputStyle, borderColor: confirmation.length > 0 && !confirmationValid ? '#c0392b' : 'var(--color-border)' }}
              />
              {confirmation.length > 0 && !confirmationValid && (
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#c0392b' }}>Must type exactly: SEND NEWSLETTER</p>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between' }}>
              <button type="button" onClick={onBack} style={{ ...buttonStyle, background: 'var(--color-surface)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
                &larr; Back
              </button>
              <button
                type="submit"
                disabled={!canSend}
                style={{ ...buttonStyle, background: canSend ? 'var(--color-primary)' : 'var(--color-border)', color: canSend ? 'var(--color-bg)' : 'var(--color-text-muted)', cursor: canSend ? 'pointer' : 'not-allowed' }}
              >
                {loading ? 'Scheduling…' : 'Schedule Send'}
              </button>
            </div>
          </form>
        </>
      )}

      {/* Analytics panel — shown after sent */}
      {isSentFinal && (
        <div style={{ marginTop: '8px', padding: '20px 24px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 16px 0', fontFamily: 'var(--font-display)', fontSize: '17px', color: 'var(--color-text)' }}>Analytics</h3>
          {analyticsLoading ? (
            <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '14px' }}>Loading analytics…</p>
          ) : analytics ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '16px' }}>
              {[
                { label: 'Sent', value: analytics.sent_count.toLocaleString() },
                { label: 'Open Rate', value: `${(analytics.open_rate * 100).toFixed(1)}%` },
                { label: 'Click Rate', value: `${(analytics.click_rate * 100).toFixed(1)}%` },
                { label: 'Unsubscribes', value: analytics.unsubscribes.toLocaleString() },
              ].map(({ label, value }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-primary)', fontFamily: 'var(--font-display)' }}>{value}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>{label}</div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '14px' }}>Analytics not available yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
