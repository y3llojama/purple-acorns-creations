import Image from 'next/image'
import type { GalleryItem } from '@/lib/supabase/types'

interface Props { items: GalleryItem[]; watermark?: string | null }

export default function FeaturedPieces({ items, watermark }: Props) {
  if (items.length === 0) return null

  return (
    <section style={{ padding: '80px 24px', background: 'var(--color-bg)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '36px', color: 'var(--color-primary)', marginBottom: '40px', textAlign: 'center' }}>
          Featured Pieces
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '32px' }}>
          {items.map((item) => {
            const src = watermark
              ? `/api/gallery/image?url=${encodeURIComponent(item.url)}`
              : item.url
            return (
              <figure key={item.id} style={{ margin: 0, background: 'var(--color-surface)', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ position: 'relative', width: '100%', aspectRatio: '1' }}>
                  <Image
                    src={src}
                    alt={item.alt_text}
                    fill
                    style={{ objectFit: 'cover' }}
                    sizes="(max-width: 768px) 100vw, 280px"
                  />
                </div>
                {item.alt_text && (
                  <figcaption style={{ padding: '16px', fontSize: '16px', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                    {item.alt_text}
                  </figcaption>
                )}
              </figure>
            )
          })}
        </div>
      </div>
    </section>
  )
}
