import ProductGrid from '@/components/shop/ProductGrid'

export const metadata = { title: 'Shop' }

export default function ShopPage() {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px 60px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', marginBottom: '40px', textAlign: 'center' }}>Shop</h1>
      <ProductGrid />
    </div>
  )
}
