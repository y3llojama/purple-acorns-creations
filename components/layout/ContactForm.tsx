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
    const res = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    if (res.ok) { setStatus('success'); form.reset() }
    else { const d = await res.json(); setError(d.error ?? 'Something went wrong.'); setStatus('error') }
  }

  if (status === 'success') {
    return <p role="status" aria-live="polite" style={{ color: 'var(--color-accent)', fontSize: '18px' }}>Thank you! We&apos;ll be in touch soon.</p>
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ marginBottom: '16px' }}>
        <label htmlFor="contact-name" style={{ display: 'block', marginBottom: '4px', color: 'rgba(255,255,255,0.8)', fontSize: '16px' }}>Name *</label>
        <input id="contact-name" name="name" required maxLength={100} style={{ width: '100%', padding: '10px', fontSize: '18px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', color: '#fff' }} />
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label htmlFor="contact-email" style={{ display: 'block', marginBottom: '4px', color: 'rgba(255,255,255,0.8)', fontSize: '16px' }}>Email *</label>
        <input id="contact-email" name="email" type="email" required maxLength={254} style={{ width: '100%', padding: '10px', fontSize: '18px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', color: '#fff' }} />
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label htmlFor="contact-message" style={{ display: 'block', marginBottom: '4px', color: 'rgba(255,255,255,0.8)', fontSize: '16px' }}>Message *</label>
        <textarea id="contact-message" name="message" required maxLength={2000} rows={4} style={{ width: '100%', padding: '10px', fontSize: '18px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)', color: '#fff', resize: 'vertical' }} />
      </div>
      {error && <p role="alert" aria-live="polite" style={{ color: '#ffb3b3', marginBottom: '12px', fontSize: '16px' }}>{error}</p>}
      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '14px', marginBottom: '12px' }}>
        By submitting this form you agree to our{' '}
        <Link href="/privacy" style={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'underline' }}>Privacy Policy</Link>.
      </p>
      <button type="submit" disabled={status === 'loading'} style={{ background: 'var(--color-accent)', color: 'var(--color-primary)', padding: '12px 28px', fontSize: '18px', border: 'none', borderRadius: '4px', cursor: 'pointer', minHeight: '48px', fontWeight: '600' }}>
        {status === 'loading' ? 'Sending…' : 'Send Message'}
      </button>
    </form>
  )
}
