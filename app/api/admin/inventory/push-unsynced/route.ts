import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { pushProduct } from '@/lib/channels/square/catalog'

export async function POST() {
  const { error } = await requireAdminSession()
  if (error) return error

  const supabase = createServiceRoleClient()
  const { data: products, error: fetchError } = await supabase
    .from('products')
    .select('*')
    .is('square_catalog_id', null)
    .eq('is_active', true)

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!products?.length) return NextResponse.json({ pushed: 0, errors: [] })

  let pushed = 0
  const errors: string[] = []

  for (const product of products) {
    const result = await pushProduct(product)
    if (result.success) {
      pushed++
    } else {
      errors.push(`${product.name}: ${result.error}`)
    }
  }

  return NextResponse.json({ pushed, errors })
}
