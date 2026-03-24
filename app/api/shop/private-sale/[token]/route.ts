import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/get-client-ip'

const rateMap = new Map<string, { count: number; reset: number }>()
function checkRate(ip: string): boolean {
  const now = Date.now()
  const entry = rateMap.get(ip) ?? { count: 0, reset: now + 60_000 }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000 }
  entry.count++; rateMap.set(ip, entry)
  return entry.count <= 30
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const ip = getClientIp(request)
  if (!checkRate(ip)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { token } = await params
  const supabase = createServiceRoleClient()

  const { data: sale, error: saleErr } = await supabase
    .from('private_sales')
    .select('id, expires_at, used_at, revoked_at, items:private_sale_items(quantity, custom_price, product:products(id,name,description,price,images,is_active))')
    .eq('token', token)
    .maybeSingle()
  if (saleErr) {
    console.error('[private-sale] DB error:', saleErr.message)
    return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 })
  }

  // All invalid states return 410 (no enumeration side-channel)
  if (!sale) return NextResponse.json({ error: 'This link is no longer available' }, { status: 410 })
  if (sale.used_at || sale.revoked_at) return NextResponse.json({ error: 'This link is no longer available' }, { status: 410 })

  // Lazy expiry cleanup
  if (new Date(sale.expires_at) <= new Date()) {
    const { error: releaseErr } = await supabase.rpc('release_private_sale_stock', { sale_id: sale.id })
    if (releaseErr) console.error('[private-sale] release_private_sale_stock failed for sale_id:', sale.id, releaseErr.message)
    return NextResponse.json({ error: 'This link is no longer available' }, { status: 410 })
  }

  const { data: settings } = await supabase.from('settings').select('shipping_mode,shipping_value').limit(1).maybeSingle()

  return NextResponse.json({
    items: sale.items,
    expiresAt: sale.expires_at,
    shipping: { mode: settings?.shipping_mode ?? 'fixed', value: settings?.shipping_value ?? 0 },
  })
}
