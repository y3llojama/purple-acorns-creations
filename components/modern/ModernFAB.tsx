'use client'

import { useState, useRef, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

type ChatStep = 'quick' | 'compose' | 'sent'

export default function ModernFAB() {
  const pathname = usePathname()
  const router = useRouter()
  const isContactPage = pathname === '/contact'

  // ── Scroll-to-top (right side) ───────────────────────────────────────
  const [scrollVisible, setScrollVisible] = useState(false)

  useEffect(() => {
    function onScroll() { setScrollVisible(window.scrollY > 400) }
    setScrollVisible(window.scrollY > 400)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }) }

  // ── Chat panel (left side) ───────────────────────────────────────────
  const [chatOpen, setChatOpen] = useState(false)
  const [chatStep, setChatStep] = useState<ChatStep>('quick')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const firstInputRef = useRef<HTMLInputElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (chatOpen && chatStep === 'compose') firstInputRef.current?.focus()
  }, [chatOpen, chatStep])

  useEffect(() => {
    if (!chatOpen) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closeChat() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chatOpen])

  useEffect(() => {
    if (!chatOpen) return
    function onPointer(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) closeChat()
    }
    const t = setTimeout(() => document.addEventListener('mousedown', onPointer), 100)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onPointer) }
  }, [chatOpen])

  function openChat() { setChatOpen(true); setChatStep('quick') }
  function closeChat() {
    setChatOpen(false); setChatStep('quick')
    setName(''); setEmail(''); setMessage(''); setError('')
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSending(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Something went wrong.'); return }
      setChatStep('sent')
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSending(false)
    }
  }

  // ── Accessibility panel (right side) ─────────────────────────────────
  const [a11yOpen, setA11yOpen] = useState(false)
  const [largeText, setLargeText] = useState(false)
  const [highContrast, setHighContrast] = useState(false)

  function toggleLargeText() {
    const next = !largeText
    setLargeText(next)
    document.body.style.fontSize = next ? '120%' : ''
  }

  function toggleHighContrast() {
    const next = !highContrast
    setHighContrast(next)
    if (next) document.documentElement.setAttribute('data-contrast', 'high')
    else document.documentElement.removeAttribute('data-contrast')
  }

  const fabStyle: React.CSSProperties = {
    width: '52px', height: '52px', borderRadius: '50%',
    background: 'var(--color-primary)', color: '#fff', border: 'none',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
    transition: 'background 0.2s ease, transform 0.2s ease',
    fontSize: '20px', flexShrink: 0,
  }

  return (
    <>
      <style>{`
        /* ── Chat panel ── */
        .mfab-chat-panel {
          position: absolute;
          bottom: 64px;
          left: 0;
          width: 300px;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 8px 32px rgba(0,0,0,0.18);
          z-index: 500;
          transform: translateY(12px);
          opacity: 0;
          pointer-events: none;
          transition: transform 0.35s cubic-bezier(0.46,0.01,0.32,1), opacity 0.3s ease;
        }
        .mfab-chat-panel.open {
          transform: translateY(0);
          opacity: 1;
          pointer-events: auto;
        }
        .mfab-chat-header {
          background: var(--color-primary);
          color: #fff;
          padding: 18px 16px 16px;
          position: relative;
        }
        .mfab-chat-header h2 {
          margin: 0 0 4px;
          font-family: 'Jost', sans-serif;
          font-size: 16px;
          font-weight: 600;
          letter-spacing: 0.04em;
        }
        .mfab-chat-header p {
          margin: 0;
          font-family: 'Jost', sans-serif;
          font-size: 13px;
          opacity: 0.88;
          line-height: 1.4;
        }
        .mfab-chat-close {
          position: absolute;
          top: 4px; right: 4px;
          background: rgba(255,255,255,0.2);
          border: none; color: #fff;
          width: 48px; height: 48px;
          border-radius: 50%; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; line-height: 1;
        }
        .mfab-chat-close:hover { background: rgba(255,255,255,0.3); }
        .mfab-chat-body {
          background: #fff;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .mfab-quick-label {
          font-family: 'Jost', sans-serif;
          font-size: 11px; font-weight: 600;
          letter-spacing: 0.1em; text-transform: uppercase;
          color: var(--color-text); margin-bottom: 2px;
        }
        .mfab-quick-btn {
          display: block; width: 100%;
          background: #fff; border: 1px solid var(--color-border);
          border-radius: 8px; padding: 10px 14px;
          font-family: 'Jost', sans-serif; font-size: 13px;
          color: var(--color-text); cursor: pointer;
          text-align: left;
          transition: border-color 0.15s ease, background 0.15s ease;
          text-decoration: none;
        }
        .mfab-quick-btn:hover {
          border-color: var(--color-accent);
          background: color-mix(in srgb, var(--color-accent) 6%, #fff 94%);
        }
        .mfab-input {
          width: 100%; border: 1px solid var(--color-border);
          border-radius: 6px; padding: 9px 12px;
          font-family: 'Jost', sans-serif; font-size: 13px;
          color: var(--color-text); background: #fff;
          outline: none; box-sizing: border-box;
          transition: border-color 0.15s ease;
        }
        .mfab-input:focus { border-color: var(--color-accent); }
        .mfab-textarea { resize: none; height: 80px; line-height: 1.5; }
        .mfab-send-btn {
          width: 100%; background: var(--color-primary); color: #fff;
          border: none; border-radius: 6px; padding: 10px;
          font-family: 'Jost', sans-serif; font-size: 12px; font-weight: 600;
          letter-spacing: 0.1em; text-transform: uppercase;
          cursor: pointer; transition: background 0.2s ease;
        }
        .mfab-send-btn:hover:not(:disabled) { background: var(--color-accent); }
        .mfab-send-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .mfab-error { font-family: 'Jost', sans-serif; font-size: 12px; color: #c0392b; }
        .mfab-back-btn {
          background: none; border: none; cursor: pointer;
          font-family: 'Jost', sans-serif; font-size: 12px;
          color: var(--color-text); opacity: 0.6;
          padding: 0; text-decoration: underline; text-align: left;
        }
        /* ── FAB positions ── */
        .mfab-wrap-left {
          position: fixed;
          bottom: 24px; left: 24px;
          z-index: 400;
        }
        .mfab-wrap-right {
          position: fixed;
          bottom: 24px; right: 24px;
          z-index: 400;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 12px;
        }
        /* Scroll-to-top: fade in/out */
        .mfab-scroll-top {
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s ease;
        }
        .mfab-scroll-top.visible {
          opacity: 1;
          pointer-events: auto;
        }
        .mfab-a11y-panel {
          position: absolute;
          bottom: 60px; right: 0;
          background: #fff;
          border: 1px solid var(--color-border);
          border-radius: 8px; padding: 16px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.14);
          min-width: 180px; z-index: 500;
          display: flex; flex-direction: column; gap: 12px;
        }
        .mfab-a11y-row {
          display: flex; align-items: center;
          justify-content: space-between;
          font-family: 'Jost', sans-serif; font-size: 14px;
          color: #222; cursor: pointer; gap: 12px;
        }
        .mfab-a11y-close {
          margin-top: 4px; background: none;
          border: 1px solid var(--color-border);
          border-radius: 4px; padding: 6px 12px;
          font-size: 13px; cursor: pointer;
          color: #444; font-family: 'Jost', sans-serif;
        }
      `}</style>

      {/* ── Left: Chat FAB / Close on contact page ── */}
      <div ref={wrapperRef} className="mfab-wrap-left">
        {!isContactPage && (
          <div id="mfab-chat-dialog" className={`mfab-chat-panel${chatOpen ? ' open' : ''}`} role="dialog" aria-label="Chat with us" aria-modal="true">
            <div className="mfab-chat-header">
              <h2><span aria-hidden="true">👋</span> Chat with us</h2>
              <p>Hi! Send us a message and we&apos;ll get back to you soon.</p>
              <button className="mfab-chat-close" onClick={closeChat} aria-label="Close chat">✕</button>
            </div>
            <div className="mfab-chat-body">
              {chatStep === 'quick' && (
                <>
                  <div className="mfab-quick-label">Quick links</div>
                  <a href="/contact" className="mfab-quick-btn"><span aria-hidden="true">✉️</span> Send us a message</a>
                  <a href="/our-story" className="mfab-quick-btn"><span aria-hidden="true">✨</span> Our story</a>
                  <a href="/shop" className="mfab-quick-btn"><span aria-hidden="true">🛍</span> Browse the shop</a>
                  <button className="mfab-quick-btn" onClick={() => setChatStep('compose')} style={{ fontWeight: 600, borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>
                    <span aria-hidden="true">💬</span> Write us a message
                  </button>
                </>
              )}
              {chatStep === 'compose' && (
                <form onSubmit={handleSend} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label htmlFor="mfab-name" className="sr-only">Your name</label>
                  <input ref={firstInputRef} id="mfab-name" className="mfab-input" type="text" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} required maxLength={100} />
                  <label htmlFor="mfab-email" className="sr-only">Email address</label>
                  <input id="mfab-email" className="mfab-input" type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} required />
                  <label htmlFor="mfab-message" className="sr-only">Message</label>
                  <textarea id="mfab-message" className="mfab-input mfab-textarea" placeholder="Write your message…" value={message} onChange={e => setMessage(e.target.value)} required maxLength={2000} />
                  {error && <p className="mfab-error" role="alert">{error}</p>}
                  <button className="mfab-send-btn" type="submit" disabled={sending}>{sending ? 'Sending…' : 'Send message'}</button>
                  <button type="button" className="mfab-back-btn" onClick={() => { setChatStep('quick'); setError('') }}>← Back</button>
                </form>
              )}
              {chatStep === 'sent' && (
                <div style={{ textAlign: 'center', padding: '8px 0 4px', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                  <span style={{ fontSize: '36px' }} aria-hidden="true">🎉</span>
                  <p style={{ fontFamily: "'Jost', sans-serif", fontSize: '14px', color: 'var(--color-text)', margin: 0, lineHeight: 1.5 }}>
                    Message received! We&apos;ll be in touch soon.
                  </p>
                  <button className="mfab-quick-btn" onClick={closeChat} style={{ width: 'auto', padding: '8px 20px' }}>Close</button>
                </div>
              )}
            </div>
          </div>
        )}

        {isContactPage ? (
          <button aria-label="Go back" onClick={() => router.back()} style={fabStyle}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        ) : (
          <button
            aria-label={chatOpen ? 'Close chat' : 'Chat with us'}
            aria-expanded={chatOpen}
            aria-controls="mfab-chat-dialog"
            onClick={chatOpen ? closeChat : openChat}
            style={fabStyle}
          >
            {chatOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* ── Right: Scroll-to-top (above) + Accessibility FAB (bottom) ── */}
      <div className="mfab-wrap-right">
        <div className={`mfab-scroll-top${scrollVisible ? ' visible' : ''}`}>
          <button aria-label="Back to top" onClick={scrollToTop} tabIndex={scrollVisible ? 0 : -1} style={fabStyle}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
        </div>
        <div style={{ position: 'relative' }}>
          {a11yOpen && (
            <div
              className="mfab-a11y-panel"
              id="mfab-a11y-dialog"
              role="dialog"
              aria-label="Accessibility options"
              aria-modal="true"
            >
              <label className="mfab-a11y-row">
                <span>Larger text</span>
                <input type="checkbox" checked={largeText} onChange={toggleLargeText} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
              </label>
              <label className="mfab-a11y-row">
                <span>High contrast</span>
                <input type="checkbox" checked={highContrast} onChange={toggleHighContrast} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
              </label>
              <button className="mfab-a11y-close" onClick={() => setA11yOpen(false)} aria-label="Close accessibility panel">Close</button>
            </div>
          )}
          <button
            aria-label="Accessibility options"
            aria-expanded={a11yOpen}
            aria-controls="mfab-a11y-dialog"
            onClick={() => setA11yOpen(o => !o)}
            style={{ ...fabStyle, fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: '15px', letterSpacing: '-0.5px' }}
          >
            Aa
          </button>
        </div>
      </div>
    </>
  )
}
