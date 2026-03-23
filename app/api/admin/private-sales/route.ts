import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { sanitizeText } from '@/lib/sanitize'
import { releaseExpiredSales } from '@/lib/private-sales'

const EXPIRES_IN_MAP: Record<string, string> = {
  '48h': '48 hours',
  '7d':  '7 days',
  '14d': '14 days',
}

export async function GET(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const page  = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20')))

  const supabase = createServiceRoleClient()

  // Auto-release expired links (up to 50) — lazy cleanup
  await releaseExpiredSales(supabase)

  const from = (page - 1) * limit
  const { data, error: dbError, count } = await supabase
    .from('private_sales')
    .select('*, items:private_sale_items(*, product:products(id,name,images,is_active))', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  if (dbError) return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  return NextResponse.json({ data, total: count ?? 0, page, limit })
}

export async function POST(request: Request) {
  const { user, error } = await requireAdminSession()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const items: Array<{ productId: string; quantity: number; customPrice: number }> = Array.isArray(body.items) ? body.items : []
  const expiresIn: string = typeof body.expiresIn === 'string' ? body.expiresIn : ''
  const customerNote: string = typeof body.customerNote === 'string' ? sanitizeText(body.customerNote).slice(0, 500) : ''

  if (!items.length) return NextResponse.json({ error: 'items required' }, { status: 400 })
  if (!EXPIRES_IN_MAP[expiresIn]) return NextResponse.json({ error: 'expiresIn must be 48h, 7d, or 14d' }, { status: 400 })
  for (const item of items) {
    if (!item.productId || typeof item.productId !== 'string') return NextResponse.json({ error: 'productId required' }, { status: 400 })
    if (!Number.isInteger(item.quantity) || item.quantity < 1) return NextResponse.json({ error: 'quantity must be positive integer' }, { status: 400 })
    if (typeof item.customPrice !== 'number' || item.customPrice <= 0) return NextResponse.json({ error: 'customPrice must be > 0' }, { status: 400 })
    if (!/^\d+(\.\d{1,2})?$/.test(String(item.customPrice))) return NextResponse.json({ error: 'customPrice max 2 decimal places' }, { status: 400 })
  }

  // Validate products exist and are active
  const supabase = createServiceRoleClient()
  const { data: products, error: productsError } = await supabase
    .from('products').select('id,is_active').in('id', items.map(i => i.productId))
  if (productsError) return NextResponse.json({ error: 'Failed to validate products' }, { status: 500 })
  for (const item of items) {
    const p = products?.find(p => p.id === item.productId)
    if (!p) return NextResponse.json({ error: `Product not found: ${item.productId}` }, { status: 400 })
    if (!p.is_active) return NextResponse.json({ error: `Product not active: ${item.productId}` }, { status: 400 })
  }

  // Calculate expiry
  const expiresAt = new Date()
  if (expiresIn === '48h') expiresAt.setHours(expiresAt.getHours() + 48)
  else if (expiresIn === '7d') expiresAt.setDate(expiresAt.getDate() + 7)
  else expiresAt.setDate(expiresAt.getDate() + 14)

  const salePayload = { created_by: user.email, expires_at: expiresAt.toISOString(), customer_note: customerNote || null }
  const itemsPayload = items.map(i => ({ product_id: i.productId, quantity: i.quantity, custom_price: i.customPrice }))

  const { data: sale, error: rpcError } = await supabase.rpc('create_private_sale', { sale: salePayload, items: itemsPayload })
  if (rpcError) {
    if (rpcError.message.includes('INSUFFICIENT_STOCK')) return NextResponse.json({ error: 'Insufficient stock for one or more items' }, { status: 409 })
    return NextResponse.json({ error: 'Failed to create private sale' }, { status: 500 })
  }

  const origin = new URL(request.url).origin
  const url = `${origin}/private-sale/${sale.token}`
  return NextResponse.json({ id: sale.id, token: sale.token, expiresAt: sale.expires_at, url }, { status: 201 })
}
