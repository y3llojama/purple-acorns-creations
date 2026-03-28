'use client'

import Image from 'next/image'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Product } from '@/lib/supabase/types'
import { watermarkSrc } from '@/lib/image-url'

const HeartButton = dynamic(() => import('./HeartButton'), { ssr: false })
import ShareButton from './ShareButton'

interface Props {
  product: Product
  showPrice?: boolean
  watermark?: string | null
}

export default function ProductCard({ product, showPrice = true, watermark }: Props) {
  const firstImage = product.images && product.images.length > 0 ? product.images[0] : null
  const fullUrl = typeof window !== 'undefined' ? window.location.origin + '/shop/' + product.id : ''
  return (
    <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden', background: 'var(--color-surface)' }}>
      <Link href={`/shop/${product.id}`} style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', flex: 1 }}>
        {/* Image area */}
        <div style={{ position: 'relative', aspectRatio: '1', background: 'var(--color-border)', overflow: 'hidden' }}>
          {firstImage ? (
            <Image
              src={watermark ? watermarkSrc(firstImage, watermark, product.updated_at) : firstImage}
              alt={product.name}
              fill
              sizes="(max-width: 480px) 100vw, (max-width: 768px) 50vw, 25vw"
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
        <HeartButton productId={product.id} name={product.name} price={product.price} images={product.images ?? []} />
        <ShareButton url={`${typeof window !== 'undefined' ? window.location.origin : ''}/shop/${product.id}`} label="Copy product link" />
        {firstImage && (
          <a
            href={`https://www.pinterest.com/pin/create/link/?url=${encodeURIComponent(fullUrl)}&media=${encodeURIComponent(firstImage)}&description=${encodeURIComponent(product.name)}`}
            rel="noopener noreferrer"
            target="_blank"
            aria-label="Pin on Pinterest"
            onClick={() => { fetch('/api/analytics/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_type: 'share_click', page_path: window.location.pathname, metadata: { channel: 'pinterest', product_id: product.id } }), keepalive: true }).catch(() => {}) }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', minHeight: '48px', minWidth: '48px', color: 'var(--color-text-muted)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0Z" />
            </svg>
          </a>
        )}
      </div>
    </div>
  )
}
