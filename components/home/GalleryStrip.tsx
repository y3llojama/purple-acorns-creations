import Image from 'next/image'
import type { GalleryItem } from '@/lib/supabase/types'
import { isValidHttpsUrl } from '@/lib/validate'
import { watermarkSrc } from '@/lib/image-url'

interface Props { items: GalleryItem[]; watermark?: string | null }

export default function GalleryStrip({ items, watermark }: Props) {
  if (items.length === 0) return null

  return (
    <section style={{ padding: '48px 0', background: 'var(--color-bg)', overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          gap: '16px',
          overflowX: 'auto',
          padding: '0 24px',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {items.filter(item => isValidHttpsUrl(item.url)).map((item) => {
          const src = watermark
            ? watermarkSrc(item.url, watermark, item.created_at)
            : item.url
          return (
            <figure key={item.id} style={{ margin: 0, flexShrink: 0, width: '280px' }}>
              <div style={{ position: 'relative', width: '280px', height: '280px', borderRadius: '8px', overflow: 'hidden' }}>
                <Image src={src} alt={item.alt_text} fill style={{ objectFit: 'cover' }} sizes="280px" />
              </div>
              {item.alt_text && (
                <figcaption style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '6px', textAlign: 'center', lineHeight: 1.3 }}>
                  {item.alt_text}
                </figcaption>
              )}
            </figure>
          )
        })}
      </div>
    </section>
  )
}
