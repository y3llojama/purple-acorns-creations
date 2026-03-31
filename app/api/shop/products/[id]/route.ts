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
    supabase.from('product_variations')
      .select('id,price,stock_count,is_default,is_active,image_url,option_values:variation_option_values(value:item_option_values(id,name,option:item_options(name)))')
      .eq('product_id', id).eq('is_active', true),
  ])

  if (error || !product) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Compute in_stock boolean per variation (never expose stock_count publicly)
  const safeVariations = (variations ?? []).map(v => {
    const optVals = (v as any).option_values ?? []
    const label = optVals.map((ov: any) => `${ov.value?.option?.name}: ${ov.value?.name}`).filter((s: string) => s !== 'undefined: undefined').join(' / ')
    return {
      id: v.id,
      price: v.price,
      is_default: v.is_default,
      is_active: v.is_active,
      image_url: v.image_url,
      label: label || undefined,
      in_stock: (v as any).stock_count > 0,
    }
  })

  return NextResponse.json({ ...product, variations: safeVariations })
}
