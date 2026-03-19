'use client'
import { useState } from 'react'
import { isValidHttpsUrl } from '@/lib/validate'

interface Props { text: string; linkUrl: string | null; linkLabel: string | null }

export default function AnnouncementBanner({ text, linkUrl, linkLabel }: Props) {
  const [visible, setVisible] = useState(() => {
    try { return !sessionStorage.getItem('announcement-dismissed') } catch { return true }
  })

  function dismiss() {
    try { sessionStorage.setItem('announcement-dismissed', '1') } catch {}
    setVisible(false)
  }

  if (!visible) return null

  const safeLink = linkUrl && isValidHttpsUrl(linkUrl) ? linkUrl : null

  return (
    <div
      role="region"
      aria-label="Announcement"
      style={{
        background: 'var(--color-announce-bg, var(--color-primary))',
        color: 'var(--color-announce-text, #ffffff)',
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        fontSize: '11px',
        letterSpacing: '0.08em',
        fontFamily: "'Jost', sans-serif",
        fontWeight: 500,
        position: 'relative',
        paddingRight: '40px',
      }}
    >
      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80vw' }}>{text}</span>
      {safeLink && (
        <a
          href={safeLink}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--color-announce-text, #ffffff)', textDecoration: 'underline', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          {linkLabel ?? 'Learn more'} →
        </a>
      )}
      <button
        onClick={dismiss}
        aria-label="Dismiss announcement"
        style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--color-announce-text, #ffffff)', fontSize: '14px', cursor: 'pointer', padding: '4px 8px', opacity: 0.7, lineHeight: 1 }}
      >
        ×
      </button>
    </div>
  )
}
