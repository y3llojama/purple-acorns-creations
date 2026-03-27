'use client'

import { useEffect, useState } from 'react'
import { Heart, HeartPlus } from 'lucide-react'
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
  const [isSharedView, setIsSharedView] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setIsSharedView(params.get('ref') === 'share')
  }, [])

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    toggle(productId, { name, price, images })
  }

  const Icon = isSharedView && !saved ? HeartPlus : Heart

  return (
    <button
      onClick={handleClick}
      aria-label={
        isSharedView && !saved
          ? `Add ${name} to my favorites`
          : saved
            ? `Remove ${name} from saved items`
            : `Save ${name}`
      }
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
        color: saved ? 'var(--color-primary)' : 'var(--color-text-muted)',
      }}
    >
      <Icon
        size={20}
        fill={saved ? 'var(--color-primary)' : 'none'}
        stroke={saved ? 'var(--color-primary)' : 'currentColor'}
      />
    </button>
  )
}
