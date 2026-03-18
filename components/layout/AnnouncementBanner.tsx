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
    <div role="region" aria-label="Announcement" style={{ background: 'var(--color-primary)', color: 'var(--color-accent)', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', fontSize: '16px', position: 'relative' }}>
      <span>{text}</span>
      {safeLink && (
        <a href={safeLink} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}>
          {linkLabel ?? 'Learn more'}
        </a>
      )}
      <button onClick={dismiss} aria-label="Dismiss announcement" style={{ position: 'absolute', right: '16px', background: 'none', border: 'none', color: 'var(--color-accent)', fontSize: '20px', cursor: 'pointer', padding: '8px', minWidth: '48px', minHeight: '48px' }}>
        ×
      </button>
    </div>
  )
}
