import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import InventoryManager from '@/components/admin/InventoryManager'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Inventory' }

export default async function InventoryPage() {
  const { error } = await requireAdminSession()
  if (error) redirect('/admin/login')
  const supabase = createServiceRoleClient()
  const [{ data: products }, { data: settings }] = await Promise.all([
    supabase.from('products').select('*').order('created_at', { ascending: false }),
    supabase.from('settings').select('square_sync_enabled, square_category_ids').single(),
  ])
  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', marginBottom: '32px' }}>Inventory</h1>
      <InventoryManager
        initialProducts={products ?? []}
        squareSyncEnabled={settings?.square_sync_enabled ?? false}
        squareCategoryIds={(settings?.square_category_ids as Record<string, string>) ?? {}}
      />
    </div>
  )
}
