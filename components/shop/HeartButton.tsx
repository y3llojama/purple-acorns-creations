'use client'

import { Heart } from 'lucide-react'
import { useSavedItems } from '@/lib/saved-items'

interface Props {
  productId: string
  name: string
  price: number
  images: string[]
}

export default function HeartButton({ productId, name, price, images }: Props) {
  const { toggle, isSaved } = useSavedItems()
  const saved = isSaved(productId)

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    toggle(productId, { name, price, images })
  }

  return (
    <button
      onClick={handleClick}
      aria-label={saved ? `Remove ${name} from saved items` : `Save ${name}`}
      aria-pressed={saved}
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
        color: saved ? 'var(--color-error)' : 'var(--color-text-muted)',
      }}
    >
      <Heart
        size={20}
        fill={saved ? 'var(--color-error)' : 'none'}
        stroke={saved ? 'var(--color-error)' : 'currentColor'}
      />
    </button>
  )
}
