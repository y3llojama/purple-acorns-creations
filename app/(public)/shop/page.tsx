import { createServiceRoleClient } from '@/lib/supabase/server'
import { JsonLd, buildBreadcrumbSchema } from '@/lib/seo'
import { interpolate, buildVars } from '@/lib/variables'
import ProductGrid from '@/components/shop/ProductGrid'

export const metadata = {
  title: 'Shop',
  description: 'Browse handcrafted crochet jewelry, sterling silver, brass, and artisan pieces made with love by Purple Acornz Creations.',
}

const breadcrumbSchema = buildBreadcrumbSchema([
  { name: 'Home', url: 'https://www.purpleacornz.com' },
  { name: 'Shop', url: 'https://www.purpleacornz.com/shop' },
])

export default async function ShopPage() {
  const supabase = createServiceRoleClient()
  const { data: settings } = await supabase.from('settings').select('gallery_watermark, business_name').single()
  const watermark = settings?.gallery_watermark
    ? interpolate(settings.gallery_watermark, buildVars(settings.business_name))
    : null

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px 60px' }}>
      <JsonLd schema={breadcrumbSchema} />
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', marginBottom: '40px', textAlign: 'center' }}>Shop</h1>
      <ProductGrid watermark={watermark} />
    </div>
  )
}
