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

            {/* Pinterest Save button */}
            {firstImage && (
              <a
                data-pin-do="buttonPin"
                data-pin-href={fullUrl}
                data-pin-media={firstImage}
                style={{
                  fontSize: '14px',
                  color: 'var(--color-text-muted)',
                  textDecoration: 'none',
                }}
              >
                Save
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
