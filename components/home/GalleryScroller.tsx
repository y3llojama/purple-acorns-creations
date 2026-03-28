import Image from 'next/image'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isValidHttpsUrl } from '@/lib/validate'
import Link from 'next/link'
import type { Product } from '@/lib/supabase/types'
import { watermarkSrc } from '@/lib/image-url'

interface Props {
  prefetchedFeatured?: Product[]
  maxItems?: number
  watermark?: string | null
}

export default async function GalleryScroller({ prefetchedFeatured, maxItems: maxItemsProp, watermark }: Props = {}) {
  const supabase = createServiceRoleClient()

  let maxItems = maxItemsProp ?? 8
  if (maxItemsProp === undefined) {
    const { data: s } = await supabase.from('settings').select('gallery_max_items').single()
    maxItems = s?.gallery_max_items ?? 8
  }

  let featuredProducts: Product[]
  if (prefetchedFeatured !== undefined) {
    featuredProducts = prefetchedFeatured.slice(0, maxItems)
  } else {
    const { data } = await supabase
      .from('products').select('*').eq('is_active', true).eq('gallery_featured', true)
      .order('gallery_sort_order', { ascending: true }).limit(maxItems)
    featuredProducts = (data ?? []) as Product[]
  }

  const featuredIds = featuredProducts.map(p => p.id)
  const remaining = maxItems - featuredIds.length

  let filler: Product[] = []
  if (remaining > 0 && featuredIds.length > 0) {
    const { data } = await supabase.from('products').select('*').eq('is_active', true).eq('gallery_featured', false)
      .not('id', 'in', `(${featuredIds.join(',')})`)
      .order('view_count', { ascending: false }).limit(remaining)
    filler = (data ?? []) as Product[]
  } else if (remaining > 0) {
    const { data } = await supabase.from('products').select('*').eq('is_active', true).eq('gallery_featured', false)
      .order('view_count', { ascending: false }).limit(remaining)
    filler = (data ?? []) as Product[]
  }

  const items = [...featuredProducts, ...filler]
  if (!items.length) return null

  return (
    <section aria-label="Explore the collection" style={{ padding: '60px 0', background: 'var(--color-surface)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '32px', color: 'var(--color-primary)', marginBottom: '32px', textAlign: 'center' }}>
          Explore the Collection
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px', marginBottom: '32px' }}>
          {items.map(product => (
            <Link key={product.id} href={`/shop/${product.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <figure style={{ margin: 0, background: 'var(--color-bg)', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ position: 'relative', width: '100%', aspectRatio: '1' }}>
                  {product.images[0] && isValidHttpsUrl(product.images[0]) ? (
                    <Image
                      src={watermark ? watermarkSrc(product.images[0], watermark, product.updated_at) : product.images[0]}
                      alt={product.name}
                      fill
                      sizes="(max-width: 600px) 50vw, (max-width: 1200px) 25vw, 200px"
                      style={{ objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '12px' }}>No image</div>
                  )}
                </div>
                <figcaption style={{ padding: '12px' }}>
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-primary)', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</p>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--color-text-muted)' }}>${product.price.toFixed(2)}</p>
                </figcaption>
              </figure>
            </Link>
          ))}
        </div>
        <div style={{ textAlign: 'center' }}>
          <Link href="/shop" style={{ display: 'inline-block', padding: '14px 32px', background: 'var(--color-primary)', color: 'var(--color-accent)', borderRadius: '4px', textDecoration: 'none', fontSize: '16px' }}>
            See everything →
          </Link>
        </div>
      </div>
    </section>
  )
}
