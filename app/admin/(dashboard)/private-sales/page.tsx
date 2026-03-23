import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import PrivateSaleList from '@/components/admin/PrivateSaleList'
import Link from 'next/link'

export default async function PrivateSalesPage() {
  const { error } = await requireAdminSession()
  if (error) redirect('/admin/login')

  const supabase = createServiceRoleClient()
  const { data, count } = await supabase
    .from('private_sales')
    .select('*, items:private_sale_items(*, product:products(id,name))', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(0, 19)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', margin: 0 }}>Private Sales</h1>
        <Link
          href="/admin/private-sales/new"
          style={{
            padding: '10px 20px',
            background: 'var(--color-primary)',
            color: 'var(--color-accent)',
            borderRadius: '4px',
            textDecoration: 'none',
            fontSize: '14px',
            minHeight: '48px',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          Create Link
        </Link>
      </div>
      <PrivateSaleList initialData={{ data: data ?? [], total: count ?? 0 }} />
    </div>
  )
}
