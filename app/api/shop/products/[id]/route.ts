import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/get-client-ip'

const rateMap = new Map<string, { count: number; reset: number }>()
function checkRate(ip: string): boolean {
  const now = Date.now()
  const entry = rateMap.get(ip) ?? { count: 0, reset: now + 60_000 }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000 }
  entry.count++; rateMap.set(ip, entry)
  return entry.count <= 60
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ip = getClientIp(req)
  if (!checkRate(ip)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { id } = await params
  const supabase = createServiceRoleClient()

  // Fetch product from view + variations (safe public fields only)
  const [{ data: product, error }, { data: variations }] = await Promise.all([
    supabase.from('products_with_default').select('*').eq('id', id).eq('is_active', true).single(),
    supabase.from('product_variations').select('id,price,is_default,is_active,image_url').eq('product_id', id).eq('is_active', true),
  ])

  if (error || !product) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Compute in_stock boolean per variation (never expose stock_count publicly)
  const safeVariations = (variations ?? []).map(v => ({
    id: v.id,
    price: v.price,
    is_default: v.is_default,
    is_active: v.is_active,
    image_url: v.image_url,
    in_stock: true,
  }))

  return NextResponse.json({ ...product, variations: safeVariations })
}
