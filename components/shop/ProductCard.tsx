'use client'

import Image from 'next/image'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Product } from '@/lib/supabase/types'

const HeartButton = dynamic(() => import('./HeartButton'), { ssr: false })

interface Props {
  product: Product
  showPrice?: boolean
}

export default function ProductCard({ product, showPrice = true }: Props) {
  const firstImage = product.images && product.images.length > 0 ? product.images[0] : null
  const fullUrl = typeof window !== 'undefined' ? window.location.origin + '/shop/' + product.id : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden', background: 'var(--color-surface)' }}>
      <Link href={`/shop/${product.id}`} style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', flex: 1 }}>
        {/* Image area */}
        <div style={{ position: 'relative', aspectRatio: '1', background: 'var(--color-border)', overflow: 'hidden' }}>
          {firstImage ? (
            <Image
              src={firstImage}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              style={{ objectFit: 'cover' }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>No image</span>
            </div>
          )}
          {product.stock_count === 0 && (
            <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'var(--color-text-muted)', color: 'var(--color-surface)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>
              Sold out
            </div>
          )}
        </div>

        {/* Text area */}
        <div style={{ padding: '12px' }}>
          <p style={{ margin: '0 0 4px', fontSize: '14px', color: 'var(--color-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
            {product.name}
          </p>
          {showPrice && (
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted)' }}>
              ${product.price.toFixed(2)}
            </p>
          )}
        </div>
      </Link>

      {/* Actions outside the link */}
      <div style={{ padding: '0 12px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {firstImage && (
          <a
            data-pin-do="buttonPin"
            data-pin-href={fullUrl}
            data-pin-media={firstImage}
            rel="noopener noreferrer"
            target="_blank"
            style={{ display: 'block', marginTop: '4px', fontSize: '12px', color: 'var(--color-text-muted)', textDecoration: 'none' }}
          >
            Save
          </a>
        )}
        <HeartButton itemId={product.id} itemTitle={product.name} imageUrl={firstImage} />
      </div>
    </div>
  )
}
