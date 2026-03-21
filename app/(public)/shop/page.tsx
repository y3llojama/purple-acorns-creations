import { JsonLd, buildBreadcrumbSchema } from '@/lib/seo'
import ProductGrid from '@/components/shop/ProductGrid'

export const metadata = {
  title: 'Shop',
  description: 'Browse handcrafted crochet jewelry, sterling silver, brass, and artisan pieces made with love by Purple Acornz Creations.',
}

const breadcrumbSchema = buildBreadcrumbSchema([
  { name: 'Home', url: 'https://www.purpleacornz.com' },
  { name: 'Shop', url: 'https://www.purpleacornz.com/shop' },
])

export default function ShopPage() {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px 60px' }}>
      <JsonLd schema={breadcrumbSchema} />
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', marginBottom: '40px', textAlign: 'center' }}>Shop</h1>
      <ProductGrid />
    </div>
  )
}
