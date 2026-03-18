import Image from 'next/image'
import Link from 'next/link'
import type { FeaturedProduct } from '@/lib/supabase/types'
import { isValidHttpsUrl } from '@/lib/validate'

interface Props { products: FeaturedProduct[] }

export default function FeaturedPieces({ products }: Props) {
  return (
    <section style={{ padding: '80px 24px', background: 'var(--color-bg)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '36px', color: 'var(--color-primary)', marginBottom: '40px', textAlign: 'center' }}>
          Featured Pieces
        </h2>
        {products.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '32px', marginBottom: '40px' }}>
            {products.map((product) => (
              <article key={product.id} style={{ background: 'var(--color-surface)', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ position: 'relative', width: '100%', aspectRatio: '1' }}>
                  <Image
                    src={product.image_url}
                    alt={product.name}
                    fill
                    style={{ objectFit: 'cover' }}
                    sizes="(max-width: 768px) 100vw, 280px"
                  />
                </div>
                <div style={{ padding: '16px' }}>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--color-primary)', marginBottom: '8px' }}>
                    {product.name}
                  </h3>
                  {product.description && (
                    <p style={{ fontSize: '16px', color: 'var(--color-text-muted)', marginBottom: '8px', lineHeight: 1.6 }}>
                      {product.description}
                    </p>
                  )}
                  <p style={{ fontSize: '18px', color: 'var(--color-primary)', fontWeight: 'bold', marginBottom: '12px' }}>
                    ${product.price.toFixed(2)}
                  </p>
                  {product.square_url && isValidHttpsUrl(product.square_url) && (
                    <a
                      href={product.square_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: 'inline-block', background: 'var(--color-primary)', color: 'var(--color-accent)', padding: '10px 20px', borderRadius: '4px', textDecoration: 'none', fontSize: '16px' }}
                    >
                      Buy Now
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        <div style={{ textAlign: 'center' }}>
          <Link href="/shop" style={{ color: 'var(--color-primary)', fontSize: '18px', textDecoration: 'underline' }}>
            View All →
          </Link>
        </div>
      </div>
    </section>
  )
}
