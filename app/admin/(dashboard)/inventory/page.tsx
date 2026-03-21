import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import InventoryManager from '@/components/admin/InventoryManager'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Inventory' }

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { error } = await requireAdminSession()
  if (error) redirect('/admin/login')
  const { tab } = await searchParams
  const initialTab = tab === 'categories' ? 'categories' : 'products'
  const supabase = createServiceRoleClient()
  const [
    { data: products, error: productsError },
    { data: settings },
    { data: categories, error: categoriesError },
  ] = await Promise.all([
    supabase.from('products').select('*').order('created_at', { ascending: false }),
    supabase.from('settings').select('square_sync_enabled').single(),
    supabase.from('categories').select(`*, product_count:products(count)`).order('sort_order', { ascending: true }),
  ])

  if (productsError) throw new Error('Failed to load products')
  if (categoriesError) throw new Error('Failed to load categories')

  // Normalize product_count and nest children
  const flatCats = (categories ?? []).map((c: Record<string, unknown>) => ({
    ...c,
    product_count: Array.isArray(c.product_count) ? (c.product_count[0] as { count: number })?.count ?? 0 : 0,
  }))
  const nestedCats = flatCats
    .filter((c: Record<string, unknown>) => !c.parent_id)
    .map((parent: Record<string, unknown>) => ({
      ...parent,
      children: flatCats.filter((c: Record<string, unknown>) => c.parent_id === parent.id),
    }))

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', marginBottom: '32px' }}>Inventory</h1>
      <InventoryManager
        initialProducts={products ?? []}
        categories={nestedCats as import('@/lib/supabase/types').Category[]}
        squareSyncEnabled={settings?.square_sync_enabled ?? false}
        initialTab={initialTab}
      />
    </div>
  )
}
