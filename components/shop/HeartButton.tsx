'use client'
import { Heart } from 'lucide-react'
import { useSavedItems } from '@/lib/saved-items'

interface Props { itemId: string; itemTitle: string | null; imageUrl: string | null }

export default function HeartButton({ itemId, itemTitle, imageUrl }: Props) {
  const { toggle, isSaved } = useSavedItems()
  const saved = isSaved(itemId)

  function handleClick(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    toggle({ id: itemId, title: itemTitle ?? null, image_url: imageUrl ?? null })
  }

  return (
    <button
      onClick={handleClick}
      aria-label={saved ? `Remove ${itemTitle ?? 'item'} from saved items` : `Save ${itemTitle ?? 'item'}`}
      aria-pressed={saved}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', minHeight: '48px', minWidth: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: saved ? 'var(--color-error)' : 'var(--color-text-muted)' }}
    >
      <Heart size={20} fill={saved ? 'var(--color-error)' : 'none'} stroke={saved ? 'var(--color-error)' : 'currentColor'} />
    </button>
  )
}
