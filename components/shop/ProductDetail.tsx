'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import ImageCarousel from '@/components/shop/ImageCarousel'
import ProductCard from '@/components/shop/ProductCard'
import { sanitizeContent } from '@/lib/sanitize'
import { useCart } from '@/components/shop/CartContext'
import type { Product } from '@/lib/supabase/types'

const HeartButton = dynamic(() => import('@/components/shop/HeartButton'), { ssr: false })
import ShareButton from './ShareButton'

interface Props {
  product: Product
  watermark?: string | null
}

export default function ProductDetail({ product, watermark }: Props) {
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([])
  const { addToCart } = useCart()

  const firstImage = product.images && product.images.length > 0 ? product.images[0] : null
  const fullUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/shop/${product.id}`
      : `/shop/${product.id}`

  // Track product view (once per session)
  useEffect(() => {
    const key = `viewed_${product.id}`
    if (!sessionStorage.getItem(key)) {
      fetch(`/api/shop/products/${product.id}/view`, { method: 'POST' })
        .catch(() => {
          // Best-effort — silently ignore errors
        })
      sessionStorage.setItem(key, '1')
    }
  }, [product.id])

  // Fetch related products
  useEffect(() => {
    fetch(`/api/shop/products?${product.category_id ? `category_id=${product.category_id}&` : ''}sort=popular`)
      .then((res) => {
        if (!res.ok) return
        return res.json()
      })
      .then((data) => {
        if (!data) return
        const products: Product[] = Array.isArray(data) ? data : (data.products ?? [])
        // Exclude the current product, take first 4
        setRelatedProducts(products.filter((p) => p.id !== product.id).slice(0, 4))
      })
      .catch(() => {
        // Best-effort — silently ignore errors
      })
  }, [product.category_id, product.id])

  const priceFormatted = `$${product.price.toFixed(2)}`
  const inStock = product.stock_count > 0
  // sanitizeContent is always called before injecting any HTML
  const sanitizedDescription = sanitizeContent(product.description ?? '')

  return (
    <div>
      {/* Main product layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '48px',
          alignItems: 'start',
        }}
      >
        {/* Image carousel */}
        <div>
          <ImageCarousel images={product.images ?? []} alt={product.name} watermark={watermark} />
        </div>

        {/* Product info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Name */}
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--color-primary)',
              fontSize: '28px',
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            {product.name}
          </h1>

          {/* Price */}
          <p style={{ fontSize: '20px', margin: 0, color: 'var(--color-text)' }}>
            {priceFormatted}
          </p>

          {/* Stock status */}
          <p
            style={{
              margin: 0,
              fontSize: '15px',
              fontWeight: 600,
              color: inStock ? 'var(--color-primary)' : 'var(--color-text-muted)',
            }}
          >
            {inStock ? 'In stock' : 'Sold out'}
          </p>

          {/* Description — sanitized before render */}
          {sanitizedDescription && (
            <div
              style={{ fontSize: '16px', lineHeight: 1.6, color: 'var(--color-text)' }}
              dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
            />
          )}

          {/* Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginTop: '8px' }}>
            {/* Add to Cart */}
            <button
              disabled={!inStock}
              onClick={() => addToCart(product)}
              style={{
                background: inStock ? 'var(--color-primary)' : 'var(--color-border)',
                color: inStock ? 'var(--color-accent)' : 'var(--color-text-muted)',
                border: 'none',
                borderRadius: '4px',
                padding: '12px 32px',
                fontSize: '18px',
                fontFamily: 'var(--font-body)',
                cursor: inStock ? 'pointer' : 'not-allowed',
                minHeight: '48px',
              }}
            >
              {inStock ? 'Add to Cart' : 'Out of Stock'}
            </button>

            {/* Heart / Save */}
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
      </div>

      {/* Related products */}
      {relatedProducts.length > 0 && (
        <div style={{ marginTop: '64px' }}>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              color: 'var(--color-primary)',
              fontSize: '22px',
              marginBottom: '24px',
            }}
          >
            You may also like
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '24px',
            }}
          >
            {relatedProducts.map((p) => (
              <ProductCard key={p.id} product={p} watermark={watermark} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
