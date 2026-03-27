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
      await navigator.clipboard.writeText(url)
      toast('Link copied!')
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
