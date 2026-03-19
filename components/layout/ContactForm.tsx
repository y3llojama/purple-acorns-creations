'use client'
import { useState } from 'react'
import Link from 'next/link'

export default function ContactForm() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('loading')
    setError('')
    const form = e.currentTarget
    const data = {
      name: (form.elements.namedItem('name') as HTMLInputElement).value.trim(),
      email: (form.elements.namedItem('email') as HTMLInputElement).value.trim(),
      message: (form.elements.namedItem('message') as HTMLTextAreaElement).value.trim(),
    }
    try {
      const res = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      if (res.ok) { setStatus('success'); form.reset() }
      else {
        const d = await res.json().catch(() => ({}))
        setError((d as { error?: string }).error ?? 'Something went wrong.')
        setStatus('error')
      }
    } catch {
      setError('Unable to send message. Please check your connection and try again.')
      setStatus('error')
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', fontSize: '16px', borderRadius: '6px',
    border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.08)',
    color: '#fff', outline: 'none', boxSizing: 'border-box', minHeight: '48px',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', marginBottom: '6px', color: 'rgba(255,255,255,0.75)', fontSize: '14px', fontWeight: '500', letterSpacing: '0.03em',
  }

  if (status === 'success') {
    return (
      <div role="status" aria-live="polite" style={{ padding: '24px 0' }}>
        <p style={{ color: 'var(--color-accent)', fontSize: '20px', marginBottom: '8px', fontFamily: 'var(--font-display)' }}>Message sent!</p>
        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '16px' }}>Thank you for reaching out. We&apos;ll get back to you soon.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <div>
          <label htmlFor="contact-name" style={labelStyle}>Name</label>
          <input id="contact-name" name="name" required maxLength={100} placeholder="Your name" style={fieldStyle}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? 'contact-form-error' : undefined} />
        </div>
        <div>
          <label htmlFor="contact-email" style={labelStyle}>Email</label>
          <input id="contact-email" name="email" type="email" required maxLength={254} placeholder="you@example.com" style={fieldStyle}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? 'contact-form-error' : undefined} />
        </div>
      </div>
      <div style={{ marginBottom: '20px' }}>
        <label htmlFor="contact-message" style={labelStyle}>Message</label>
        <textarea id="contact-message" name="message" required maxLength={2000} rows={4} placeholder="Tell us what's on your mind…"
          style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'inherit' }}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? 'contact-form-error' : undefined} />
      </div>
      {error && <p id="contact-form-error" role="alert" style={{ color: '#ffb3b3', marginBottom: '16px', fontSize: '15px' }}>{error}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
        <button type="submit" disabled={status === 'loading'} style={{ background: 'var(--color-accent)', color: 'var(--color-primary)', padding: '12px 32px', fontSize: '16px', border: 'none', borderRadius: '6px', cursor: 'pointer', minHeight: '48px', fontWeight: '600', letterSpacing: '0.02em' }}>
          {status === 'loading' ? 'Sending…' : 'Send Message'}
        </button>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', margin: 0 }}>
          By submitting, you agree to our <Link href="/privacy" style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'underline' }}>Privacy Policy</Link>.
        </p>
      </div>
    </form>
  )
}
