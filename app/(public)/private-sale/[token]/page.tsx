import { createServiceRoleClient } from '@/lib/supabase/server'
import PrivateSaleCheckout from '@/components/shop/PrivateSaleCheckout'

interface PageProps { params: Promise<{ token: string }> }

function Unavailable() {
  return (
    <main style={{ maxWidth: '520px', margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', marginBottom: '16px' }}>
        Link Unavailable
      </h1>
      <p style={{ color: 'var(--color-text-muted)' }}>
        This private sale link has expired, been used, or is no longer valid.
      </p>
    </main>
  )
}

export default async function PrivateSalePage({ params }: PageProps) {
  const { token } = await params
  const supabase = createServiceRoleClient()

  const { data: sale } = await supabase
    .from('private_sales')
    .select('id, expires_at, used_at, revoked_at, items:private_sale_items(quantity, custom_price, product:products(id,name,description,price,images,is_active))')
    .eq('token', token)
    .maybeSingle()

  if (!sale || sale.used_at || sale.revoked_at) return <Unavailable />
  if (new Date(sale.expires_at) <= new Date()) {
    // Lazy expiry cleanup (fire-and-forget)
    void supabase.rpc('release_private_sale_stock', { sale_id: sale.id }).then(({ error }) => {
      if (error) console.error('release_private_sale_stock failed:', error)
    })
    return <Unavailable />
  }

  const { data: settings } = await supabase
    .from('settings').select('shipping_mode,shipping_value').limit(1).maybeSingle()

  const saleData = {
    items: sale.items as any,  // Supabase join typing — shape validated by select string
    expiresAt: sale.expires_at,
    shipping: { mode: (settings?.shipping_mode ?? 'fixed') as 'fixed' | 'percentage', value: settings?.shipping_value ?? 0 },
  }

  return <PrivateSaleCheckout sale={saleData} token={token} />
}
