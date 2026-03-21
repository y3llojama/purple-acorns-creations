import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { sanitizeText, sanitizeContent } from '@/lib/sanitize'
import { syncProduct } from '@/lib/channels'

export async function GET(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const { searchParams } = new URL(request.url)
  const categoryId = searchParams.get('category_id')
  const search = searchParams.get('search')
  const supabase = createServiceRoleClient()
  let query = supabase.from('products').select('*').order('created_at', { ascending: false })
  if (categoryId) query = query.eq('category_id', categoryId)
  if (search) query = query.ilike('name', `%${search}%`)
  const { data, error: dbError } = await query
  if (dbError) return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const name = sanitizeText(String(body.name ?? '').trim())
  const description = body.description ? sanitizeContent(String(body.description)) : null
  const price = parseFloat(String(body.price ?? ''))
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (isNaN(price) || price < 0) return NextResponse.json({ error: 'valid price required' }, { status: 400 })
  const images = Array.isArray(body.images) ? body.images.slice(0, 10).map(String) : []
  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase.from('products').insert({
    name, description, price, images,
    category_id: body.category_id ?? null,
    stock_count: Number(body.stock_count) || 0,
    is_active: body.is_active !== false,
    gallery_featured: Boolean(body.gallery_featured),
    gallery_sort_order: body.gallery_sort_order ? Number(body.gallery_sort_order) : null,
  }).select().single()
  if (dbError) return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  syncProduct(data).catch(console.error)
  return NextResponse.json(data, { status: 201 })
}
