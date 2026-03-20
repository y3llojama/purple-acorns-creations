import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import InventoryManager from '@/components/admin/InventoryManager'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Inventory' }

export default async function InventoryPage() {
  const { error } = await requireAdminSession()
  if (error) redirect('/admin/login')
  const supabase = createServiceRoleClient()
  const { data: products } = await supabase.from('products').select('*').order('created_at', { ascending: false })
  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', marginBottom: '32px' }}>Inventory</h1>
      <InventoryManager initialProducts={products ?? []} />
    </div>
  )
}
