import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isValidSlug } from '@/lib/validate'
import { checkRate, rateLimitResponse } from '@/lib/saved-lists-rate-limit'
import { getClientIp } from '@/lib/get-client-ip'

const notFoundMap = new Map<string, { count: number; reset: number }>()

function check404Rate(request: Request): boolean {
  const ip = getClientIp(request)
  const now = Date.now()
  const entry = notFoundMap.get(ip) ?? { count: 0, reset: now + 60_000 }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000 }
  entry.count++
  notFoundMap.set(ip, entry)
  return entry.count <= 10
}

function availability(stockCount: number, stockReserved: number): string {
  const available = stockCount - (stockReserved ?? 0)
  if (available <= 0) return 'sold_out'
  if (available <= 5) return 'low_stock'
  return 'in_stock'
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!checkRate(request, 'list-slug-view', 30, 60_000)) return rateLimitResponse()

  const { slug } = await params
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  const { data: list, error } = await supabase
    .from('saved_lists')
    .select('id, is_snapshot, updated_at')
    .eq('slug', slug)
    .single()

  if (error || !list) {
    if (!check404Rate(request)) return rateLimitResponse()
    return NextResponse.json({ error: 'List not found' }, { status: 404 })
  }

  const { data: items } = await supabase
    .from('saved_list_items')
    .select(`
      product_id,
      added_at,
      products:product_id (name, price, images, stock_count, stock_reserved, is_active)
    `)
    .eq('list_id', list.id)
    .order('added_at', { ascending: false })

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
    is_snapshot: list.is_snapshot,
    is_live: !list.is_snapshot,
    updated_at: list.updated_at,
    items: activeItems,
  })
}
