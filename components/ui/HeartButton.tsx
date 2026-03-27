'use client'

import { useSavedItems } from '@/lib/saved-items'

interface Props {
  itemId: string
  itemTitle: string | null
  imageUrl: string | null
}

export default function HeartButton({ itemId, itemTitle, imageUrl }: Props) {
  const { toggle, isSaved } = useSavedItems()
  const saved = isSaved(itemId)

  return (
    <>
      <style>{`
        .heart-btn {
          position: absolute;
          top: 10px;
          right: 10px;
          background: rgba(255, 255, 255, 0.92);
          border: none;
          border-radius: 50%;
          width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.15s ease, background 0.15s ease;
          z-index: 2;
          padding: 0;
          backdrop-filter: blur(4px);
        }
        .heart-btn:hover {
          transform: scale(1.12);
          background: rgba(255, 255, 255, 1);
        }
        .heart-btn:active { transform: scale(0.95); }
        .heart-btn svg { display: block; }
      `}</style>
      <button
        className="heart-btn"
        aria-label={saved ? `Remove ${itemTitle ?? 'item'} from saved items` : `Save ${itemTitle ?? 'item'}`}
        aria-pressed={saved}
        onClick={e => {
          e.preventDefault()
          toggle(itemId, { name: itemTitle ?? '', price: 0, images: imageUrl ? [imageUrl] : [] })
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill={saved ? 'var(--color-primary, #7b5ea7)' : 'none'}
          stroke={saved ? 'var(--color-primary, #7b5ea7)' : 'currentColor'}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>
    </>
  )
}
