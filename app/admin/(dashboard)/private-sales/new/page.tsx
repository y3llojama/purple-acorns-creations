import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PrivateSaleForm from '@/components/admin/PrivateSaleForm'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface PageProps {
  searchParams: Promise<{ clone?: string }>
}

export default async function NewPrivateSalePage({ searchParams }: PageProps) {
  const { error } = await requireAdminSession()
  if (error) redirect('/admin/login')

  const { clone } = await searchParams

  let initialItems: Array<{ product: { id: string; name: string; price: number; description: string | null; images: string[]; is_active: boolean }; quantity: number; customPrice: number }> = []
  let initialNote = ''

  if (clone && UUID_RE.test(clone)) {
    const supabase = createServiceRoleClient()
    const { data: sale } = await supabase
      .from('private_sales')
      .select('customer_note, items:private_sale_items(quantity, custom_price, product:products(id,name,price,description,images,is_active))')
      .eq('id', clone)
      .maybeSingle()

    if (sale) {
      initialNote = sale.customer_note ?? ''
      initialItems = (sale.items ?? [])
        .filter((i: any) => i.product?.is_active)
        .map((i: any) => ({
          product: i.product,
          quantity: i.quantity,
          customPrice: i.custom_price,
        }))
    }
  }

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', marginBottom: '24px' }}>
        {clone ? 'Clone Private Sale Link' : 'Create Private Sale Link'}
      </h1>
      <PrivateSaleForm initialItems={initialItems as any} initialNote={initialNote} />
    </div>
  )
}
