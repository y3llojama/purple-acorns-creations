import ProductGrid from '@/components/shop/ProductGrid'

export const metadata = { title: 'Shop' }

export default function ShopPage() {
  return (
    <div style={{ maxWidth: '1200px', margin: 'calc(-1 * var(--logo-overflow, clamp(60px, 7vw, 90px))) auto 0', padding: '60px 24px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', marginBottom: '40px', textAlign: 'center' }}>Shop</h1>
      <ProductGrid />
    </div>
  )
}
