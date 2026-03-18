import Image from 'next/image'
import type { GalleryItem } from '@/lib/supabase/types'
import { isValidHttpsUrl } from '@/lib/validate'
import WatermarkedImage from '@/components/ui/WatermarkedImage'

interface Props { items: GalleryItem[] }

export default function GalleryStrip({ items }: Props) {
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
        {items.filter(item => isValidHttpsUrl(item.url)).map((item) =>
          item.watermark_text ? (
            <WatermarkedImage
              key={item.id}
              containerStyle={{ width: '280px', height: '280px', flexShrink: 0, borderRadius: '8px' }}
              imageProps={{
                src: item.url,
                alt: item.alt_text,
                style: { objectFit: 'cover' },
                sizes: '280px',
              }}
              label={item.watermark_text}
            />
          ) : (
            <div key={item.id} style={{ position: 'relative', width: '280px', height: '280px', flexShrink: 0, borderRadius: '8px', overflow: 'hidden' }}>
              <Image src={item.url} alt={item.alt_text} fill style={{ objectFit: 'cover' }} sizes="280px" />
            </div>
          )
        )}
      </div>
    </section>
  )
}
