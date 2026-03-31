import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { sanitizeText, sanitizeContent } from '@/lib/sanitize'
import { syncProduct } from '@/lib/channels'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminSession()
  if (error) return error
  const { id } = await params
  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase.from('products').select('*').eq('id', id).single()
  if (dbError || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminSession()
  if (error) return error
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const update: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = sanitizeText(String(body.name).trim())
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
    update.name = name
  }
  if (body.description !== undefined) update.description = body.description ? sanitizeContent(String(body.description)) : null
  if (body.price !== undefined) {
    const price = parseFloat(String(body.price))
    if (isNaN(price) || price < 0) return NextResponse.json({ error: 'valid price required' }, { status: 400 })
    update.price = price
  }
  if (body.category_id !== undefined) update.category_id = body.category_id ?? null
  if (body.images !== undefined) update.images = Array.isArray(body.images) ? body.images.slice(0, 10).map(String) : []
  if (body.stock_count !== undefined) update.stock_count = Number(body.stock_count)
  if (body.is_active !== undefined) update.is_active = Boolean(body.is_active)
  if (body.gallery_featured !== undefined) update.gallery_featured = Boolean(body.gallery_featured)
  if (body.gallery_sort_order !== undefined) update.gallery_sort_order = body.gallery_sort_order ? Number(body.gallery_sort_order) : null
  update.updated_at = new Date().toISOString()
  if (Object.keys(update).length <= 1) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  const supabase = createServiceRoleClient()
  // Optimistic locking: check updated_at hasn't changed
  if (body.updated_at) {
    if (body.variationId) {
      // Lock against variation's updated_at when variationId is provided
      const { data: current } = await supabase.from('product_variations').select('updated_at').eq('id', body.variationId).single()
      if (current && current.updated_at !== body.updated_at) {
        return NextResponse.json({ error: 'Conflict: product was modified by another session' }, { status: 409 })
      }
    } else {
      const { data: current } = await supabase.from('products').select('updated_at').eq('id', id).single()
      if (current && current.updated_at !== body.updated_at) {
        return NextResponse.json({ error: 'Conflict: product was modified by another session' }, { status: 409 })
      }
    }
  }
  const { data, error: dbError } = await supabase.from('products').update(update).eq('id', id).select().single()
  if (dbError || !data) return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  // Sync price/stock to default variation
  if (body.price !== undefined || body.stock_count !== undefined) {
    const varUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.price !== undefined) varUpdate.price = update.price
    if (body.stock_count !== undefined) varUpdate.stock_count = update.stock_count
    await supabase.from('product_variations')
      .update(varUpdate)
      .eq('product_id', id)
      .eq('is_default', true)
  }
  syncProduct(data).catch(console.error)
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminSession()
  if (error) return error
  const { id } = await params
  const supabase = createServiceRoleClient()
  const { error: dbError } = await supabase.from('products').delete().eq('id', id)
  if (dbError) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  return NextResponse.json({ success: true })
}
