'use client'

import { useEffect, useState } from 'react'

/**
 * First-visit fade-out overlay — shows a brief white veil that dissolves on entry.
 * Only runs once per session (gated by sessionStorage).
 */
export default function PageLoadOverlay() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const KEY = 'pac_intro_seen'
    if (sessionStorage.getItem(KEY)) return
    sessionStorage.setItem(KEY, '1')
    setVisible(true)
    // Start dissolving after a brief moment so the overlay is painted first
    const t = setTimeout(() => setVisible(false), 80)
    return () => clearTimeout(t)
  }, [])

  if (!visible) return null

  return (
    <>
      <style>{`
        @keyframes pac-fade-out {
          from { opacity: 1; }
          to   { opacity: 0; }
        }
        .pac-load-overlay {
          position: fixed;
          inset: 0;
          background: var(--color-surface, #fff);
          z-index: 9999;
          pointer-events: none;
          animation: pac-fade-out 1s ease forwards;
        }
      `}</style>
      <div className="pac-load-overlay" aria-hidden="true" />
    </>
  )
}
