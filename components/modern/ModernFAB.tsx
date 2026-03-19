'use client'

import { useState, useEffect } from 'react'

export default function ModernFAB() {
  // ── Scroll-to-top ────────────────────────────────────────────────────
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function onScroll() { setVisible(window.scrollY > 400) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }) }

  // ── Accessibility panel ──────────────────────────────────────────────
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
    transition: 'background 0.2s ease, opacity 0.2s ease, transform 0.2s ease',
    fontSize: '20px',
    flexShrink: 0,
  }

  return (
    <>
      <style>{`
        /* ── FAB buttons ── */
        .mfab-wrap-left {
          position: fixed;
          bottom: 24px;
          left: 24px;
          z-index: 400;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s ease;
        }
        .mfab-wrap-left.visible {
          opacity: 1;
          pointer-events: auto;
        }
        .mfab-wrap-right {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 400;
        }
        .mfab-a11y-panel {
          position: absolute;
          bottom: 60px;
          right: 0;
          background: #fff;
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 16px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.14);
          min-width: 180px;
          z-index: 500;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .mfab-a11y-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-family: 'Jost', sans-serif;
          font-size: 14px;
          color: #222;
          cursor: pointer;
          gap: 12px;
        }
        .mfab-a11y-close {
          margin-top: 4px;
          background: none;
          border: 1px solid var(--color-border);
          border-radius: 4px;
          padding: 6px 12px;
          font-size: 13px;
          cursor: pointer;
          color: #444;
          font-family: 'Jost', sans-serif;
        }
      `}</style>

      {/* ── Left: Scroll-to-top FAB ── */}
      <div className={`mfab-wrap-left${visible ? ' visible' : ''}`}>
        <button
          aria-label="Back to top"
          onClick={scrollToTop}
          style={fabStyle}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      </div>

      {/* ── Right: Accessibility FAB ── */}
      <div className="mfab-wrap-right">
        {a11yOpen && (
          <div className="mfab-a11y-panel" role="dialog" aria-label="Accessibility options">
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
          onClick={() => setA11yOpen(o => !o)}
          style={{ ...fabStyle, fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: '15px', letterSpacing: '-0.5px' }}
        >
          Aa
        </button>
      </div>
    </>
  )
}
