'use client'
import { useState } from 'react'
import Link from 'next/link'
import { isValidEmail } from '@/lib/validate'

export default function NewsletterSignup() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    if (!isValidEmail(email)) {
      setStatus('error')
      setMessage('Please enter a valid email address.')
      return
    }
    setStatus('loading')
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.ok) {
        setStatus('success')
        setMessage('You\'re subscribed! Thank you.')
      } else {
        const d = await res.json().catch(() => ({}))
        setStatus('error')
        setMessage((d as { error?: string }).error ?? 'Could not subscribe. Please try again.')
      }
    } catch {
      setStatus('error')
      setMessage('Unable to subscribe. Please check your connection.')
    }
  }

  return (
    <section style={{ background: 'var(--color-surface)', padding: '64px 24px', textAlign: 'center' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '32px', color: 'var(--color-primary)', marginBottom: '12px' }}>
          Stay in the Loop
        </h2>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '24px', fontSize: '18px' }}>
          New pieces, upcoming markets, and behind-the-scenes stories.
        </p>
        {status === 'success' ? (
          <p role="status" aria-live="polite" style={{ color: 'var(--color-primary)', fontSize: '18px' }}>{message}</p>
        ) : (
          <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <label htmlFor="newsletter-email" className="sr-only">Email address</label>
            <input
              id="newsletter-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              maxLength={254}
              aria-invalid={status === 'error' || undefined}
              aria-describedby={status === 'error' ? 'newsletter-email-error' : undefined}
              style={{ padding: '12px 16px', fontSize: '18px', borderRadius: '4px', border: '1px solid var(--color-border)', flex: '1', minWidth: '200px' }}
            />
            <button type="submit" disabled={status === 'loading'} style={{ background: 'var(--color-primary)', color: 'var(--color-accent)', padding: '12px 24px', fontSize: '18px', border: 'none', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }}>
              {status === 'loading' ? 'Subscribing…' : 'Subscribe'}
            </button>
          </form>
        )}
        {status === 'error' && message && (
          <p id="newsletter-email-error" role="alert" style={{ color: '#c05050', marginTop: '8px', fontSize: '16px' }}>{message}</p>
        )}
        <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', marginTop: '12px' }}>
          By subscribing you agree to our{' '}
          <Link href="/privacy" style={{ color: 'var(--color-text-muted)', textDecoration: 'underline' }}>Privacy Policy</Link>.
        </p>
      </div>
    </section>
  )
}
