'use client'

import { Link2 } from 'lucide-react'
import { useToast } from '@/components/shop/ToastContext'

interface Props {
  url: string
  label?: string
}

export default function ShareButton({ url, label = 'Copy link' }: Props) {
  const { toast } = useToast()

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    try {
      const shareUrl = url.includes('?') ? `${url}&ref=share` : `${url}?ref=share`
      await navigator.clipboard.writeText(shareUrl)
      toast('Link copied!')
      fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'share_click', page_path: window.location.pathname, metadata: { channel: 'copy_link' } }),
        keepalive: true,
      }).catch(() => {})
    } catch {
      toast('Failed to copy link')
    }
  }

  return (
    <button
      onClick={handleClick}
      aria-label={label}
      title={label}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '8px',
        minHeight: '48px',
        minWidth: '48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-muted)',
      }}
    >
      <Link2 size={18} />
    </button>
  )
}
