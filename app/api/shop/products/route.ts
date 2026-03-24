import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/get-client-ip'

const VALID_SORTS = ['new', 'popular', 'price_asc', 'price_desc']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const rateMap = new Map<string, { count: number; reset: number }>()

function checkRate(ip: string): boolean {
  const now = Date.now()
  const entry = rateMap.get(ip) ?? { count: 0, reset: now + 60_000 }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000 }
  entry.count++; rateMap.set(ip, entry)
  return entry.count <= 100
}

export async function GET(request: Request) {
  const ip = getClientIp(request)
  if (!checkRate(ip)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  const { searchParams } = new URL(request.url)
  const categoryId = searchParams.get('category_id')
  const sort = searchParams.get('sort') ?? 'new'
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  if (!VALID_SORTS.includes(sort)) return NextResponse.json({ error: 'invalid sort' }, { status: 400 })
  const offset = (page - 1) * 24
  const supabase = createServiceRoleClient()
  let query = supabase.from('products').select('*', { count: 'exact' }).eq('is_active', true)
  if (categoryId && UUID_RE.test(categoryId)) query = query.eq('category_id', categoryId)
  switch (sort) {
    case 'popular': query = query.order('view_count', { ascending: false }); break
    case 'price_asc': query = query.order('price', { ascending: true }); break
    case 'price_desc': query = query.order('price', { ascending: false }); break
    default: query = query.order('created_at', { ascending: false })
  }
  const { data, count, error } = await query.range(offset, offset + 23)
  if (error) return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  return NextResponse.json({ products: data, total: count ?? 0, page, pageSize: 24 })
}
