'use client'

import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'

type State = 'confirm' | 'loading' | 'success' | 'error' | 'invalid'

export default function UnsubscribeForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')?.trim() ?? ''

  const [state, setState] = useState<State>(token ? 'confirm' : 'invalid')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleUnsubscribe() {
    setState('loading')
    try {
      const res = await fetch('/api/newsletter/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErrorMessage((data as { error?: string }).error ?? 'Something went wrong. Please try again.')
        setState('error')
        return
      }
      setState('success')
    } catch {
      setErrorMessage('Something went wrong. Please try again.')
      setState('error')
    }
  }

  const containerStyle: React.CSSProperties = {
    background: 'var(--color-primary)',
    color: 'var(--color-bg)',
    padding: '80px 24px',
    minHeight: '60vh',
  }

  const innerStyle: React.CSSProperties = {
    maxWidth: '560px',
    margin: '0 auto',
    textAlign: 'center',
  }

  const headingStyle: React.CSSProperties = {
    fontFamily: 'var(--font-display)',
    color: 'var(--color-accent)',
    marginBottom: '16px',
    fontSize: '32px',
  }

  const bodyStyle: React.CSSProperties = {
    color: 'rgba(255,255,255,0.75)',
    fontSize: '18px',
    lineHeight: 1.6,
    marginBottom: '40px',
  }

  const buttonStyle: React.CSSProperties = {
    display: 'inline-block',
    minHeight: '48px',
    padding: '12px 32px',
    background: 'var(--color-accent)',
    color: 'var(--color-primary)',
    border: 'none',
    borderRadius: '4px',
    fontFamily: 'var(--font-display)',
    fontSize: '16px',
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'none',
  }

  const linkStyle: React.CSSProperties = {
    color: 'var(--color-accent)',
    fontSize: '16px',
    textDecoration: 'underline',
  }

  if (state === 'invalid') {
    return (
      <section style={containerStyle}>
        <div style={innerStyle}>
          <h1 style={headingStyle}>Invalid Link</h1>
          <p style={bodyStyle}>This unsubscribe link is invalid or has expired.</p>
          <Link href="/" style={linkStyle}>← Back to Purple Acorns Creations</Link>
        </div>
      </section>
    )
  }

  if (state === 'success') {
    return (
      <section style={containerStyle}>
        <div style={innerStyle}>
          <h1 style={headingStyle}>You've been unsubscribed.</h1>
          <p style={bodyStyle}>We're sorry to see you go. You won't receive any more newsletters from us.</p>
          <Link href="/" style={linkStyle}>← Back to Purple Acorns Creations</Link>
        </div>
      </section>
    )
  }

  if (state === 'error') {
    return (
      <section style={containerStyle}>
        <div style={innerStyle}>
          <h1 style={headingStyle}>Something went wrong</h1>
          <p style={bodyStyle}>{errorMessage}</p>
          <button
            style={buttonStyle}
            onClick={() => setState('confirm')}
          >
            Try again
          </button>
        </div>
      </section>
    )
  }

  // confirm or loading
  return (
    <section style={containerStyle}>
      <div style={innerStyle}>
        <h1 style={headingStyle}>Unsubscribe</h1>
        <p style={bodyStyle}>Are you sure you want to unsubscribe from the Purple Acorns Creations newsletter?</p>
        <button
          style={{ ...buttonStyle, opacity: state === 'loading' ? 0.7 : 1, cursor: state === 'loading' ? 'not-allowed' : 'pointer' }}
          onClick={handleUnsubscribe}
          disabled={state === 'loading'}
        >
          {state === 'loading' ? 'Unsubscribing…' : 'Unsubscribe'}
        </button>
      </div>
    </section>
  )
}
