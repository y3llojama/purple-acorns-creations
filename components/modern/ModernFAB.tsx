'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ModernFAB() {
  const router = useRouter()
  const [a11yOpen, setA11yOpen] = useState(false)
  const [largeText, setLargeText] = useState(false)
  const [highContrast, setHighContrast] = useState(false)
  const [msgHover, setMsgHover] = useState(false)
  const [a11yHover, setA11yHover] = useState(false)

  function toggleLargeText() {
    const next = !largeText
    setLargeText(next)
    if (next) {
      document.body.classList.add('text-lg')
      document.body.style.fontSize = '120%'
    } else {
      document.body.classList.remove('text-lg')
      document.body.style.fontSize = ''
    }
  }

  function toggleHighContrast() {
    const next = !highContrast
    setHighContrast(next)
    if (next) {
      document.documentElement.setAttribute('data-contrast', 'high')
    } else {
      document.documentElement.removeAttribute('data-contrast')
    }
  }

  const fabBase: React.CSSProperties = {
    position: 'fixed',
    bottom: '24px',
    width: '52px',
    height: '52px',
    borderRadius: '50%',
    background: 'var(--color-primary)',
    color: '#fff',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
    zIndex: 400,
    transition: 'all 0.2s ease',
    fontSize: '20px',
  }

  return (
    <>
      {/* Left FAB — Message Us */}
      <div style={{ position: 'fixed', bottom: '24px', left: '24px', zIndex: 400 }}>
        {msgHover && (
          <div
            style={{
              position: 'absolute',
              bottom: '60px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.75)',
              color: '#fff',
              fontSize: '12px',
              padding: '4px 10px',
              borderRadius: '4px',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            Message Us
          </div>
        )}
        <button
          aria-label="Message us"
          onClick={() => router.push('/contact')}
          onMouseEnter={() => setMsgHover(true)}
          onMouseLeave={() => setMsgHover(false)}
          style={{
            ...fabBase,
            position: 'relative',
            background: msgHover ? 'var(--color-accent)' : 'var(--color-primary)',
            transform: msgHover ? 'scale(1.08)' : 'scale(1)',
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <polyline points="2,4 12,13 22,4" />
          </svg>
        </button>
      </div>

      {/* Right FAB — Accessibility */}
      <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 400 }}>
        {/* Accessibility panel */}
        {a11yOpen && (
          <div
            role="dialog"
            aria-label="Accessibility options"
            style={{
              position: 'absolute',
              bottom: '60px',
              right: '0',
              background: '#fff',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              padding: '16px',
              boxShadow: '0 4px 24px rgba(0,0,0,0.14)',
              minWidth: '180px',
              zIndex: 500,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '14px',
                  color: '#222',
                  cursor: 'pointer',
                  gap: '12px',
                }}
              >
                <span>Larger text</span>
                <input
                  type="checkbox"
                  checked={largeText}
                  onChange={toggleLargeText}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '14px',
                  color: '#222',
                  cursor: 'pointer',
                  gap: '12px',
                }}
              >
                <span>High contrast</span>
                <input
                  type="checkbox"
                  checked={highContrast}
                  onChange={toggleHighContrast}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
              </label>

              <button
                onClick={() => setA11yOpen(false)}
                aria-label="Close accessibility panel"
                style={{
                  marginTop: '4px',
                  background: 'none',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  padding: '6px 12px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  color: '#444',
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}

        <button
          aria-label="Accessibility options"
          aria-expanded={a11yOpen}
          onClick={() => setA11yOpen(o => !o)}
          onMouseEnter={() => setA11yHover(true)}
          onMouseLeave={() => setA11yHover(false)}
          style={{
            ...fabBase,
            position: 'relative',
            background: a11yHover ? 'var(--color-accent)' : 'var(--color-primary)',
            transform: a11yHover ? 'scale(1.08)' : 'scale(1)',
            fontFamily: 'Georgia, serif',
            fontWeight: 700,
            fontSize: '15px',
            letterSpacing: '-0.5px',
          }}
        >
          Aa
        </button>
      </div>
    </>
  )
}
