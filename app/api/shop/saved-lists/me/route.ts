import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isValidUuid } from '@/lib/validate'
import { checkRate, rateLimitResponse } from '@/lib/saved-lists-rate-limit'

function availability(stockCount: number, stockReserved: number): string {
  const available = stockCount - (stockReserved ?? 0)
  if (available <= 0) return 'sold_out'
  if (available <= 5) return 'low_stock'
  return 'in_stock'
}

export async function POST(request: Request) {
  if (!checkRate(request, 'list-me', 60, 60_000)) return rateLimitResponse()

  let body: { token?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { token } = body
  if (!token || !isValidUuid(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  const { data: list, error: listError } = await supabase
    .from('saved_lists')
    .select('id, slug, updated_at')
    .eq('token', token)
    .single()

  if (listError || !list) {
    return NextResponse.json({ error: 'List not found' }, { status: 404 })
  }

  const { data: items, error: itemsError } = await supabase
    .from('saved_list_items')
    .select(`
      product_id,
      added_at,
      products:product_id (name, price, images, stock_count, stock_reserved, is_active)
    `)
    .eq('list_id', list.id)
    .order('added_at', { ascending: false })

  if (itemsError) {
    return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 })
  }

  const activeItems = (items ?? [])
    .filter((item: any) => item.products?.is_active)
    .map((item: any) => ({
      product_id: item.product_id,
      name: item.products.name,
      price: item.products.price,
      images: item.products.images,
      availability: availability(item.products.stock_count, item.products.stock_reserved),
      added_at: item.added_at,
    }))

  return NextResponse.json({
    id: list.id,
    slug: list.slug,
    updated_at: list.updated_at,
    items: activeItems,
  })
}
