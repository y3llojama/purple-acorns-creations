import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { sanitizeText } from '@/lib/sanitize'
import { syncCategory } from '@/lib/channels'
import { deleteSquareCategory } from '@/lib/channels/square/catalog'

function toSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { error } = await requireAdminSession()
  if (error) return error
  const { id } = await params
  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase.from('categories').select('*').eq('id', id).single()
  if (dbError || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(request: Request, { params }: Params) {
  const { error } = await requireAdminSession()
  if (error) return error
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const supabase = createServiceRoleClient()

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
    update.name = name
    const slug = toSlug(name)
    const { data: existing } = await supabase.from('categories').select('id').eq('slug', slug).neq('id', id).single()
    if (existing) return NextResponse.json({ error: 'A category with this name already exists.' }, { status: 409 })
    update.slug = slug
  }

  if (body.parent_id !== undefined) {
    const parentId: string | null = body.parent_id ?? null
    if (parentId) {
      const { data: parent } = await supabase.from('categories').select('parent_id').eq('id', parentId).single()
      if (!parent) return NextResponse.json({ error: 'parent_id not found' }, { status: 400 })
      if (parent.parent_id) return NextResponse.json({ error: 'parent must be a top-level category (Square supports one category + one sub-category)' }, { status: 400 })
    }
    update.parent_id = parentId
  }

  if (body.sort_order !== undefined) {
    const so = Number(body.sort_order)
    if (!Number.isFinite(so)) return NextResponse.json({ error: 'invalid sort_order' }, { status: 400 })
    update.sort_order = Math.floor(so)
  }
  if (body.category_type !== undefined) {
    if (!VALID_CATEGORY_TYPES.includes(body.category_type)) {
      return NextResponse.json({ error: 'invalid category_type' }, { status: 400 })
    }
    update.category_type = body.category_type
  }
  if (body.online_visibility !== undefined) update.online_visibility = Boolean(body.online_visibility)
  if (body.seo_title !== undefined) update.seo_title = body.seo_title ? sanitizeText(String(body.seo_title)) : null
  if (body.seo_description !== undefined) update.seo_description = body.seo_description ? sanitizeText(String(body.seo_description)) : null
  if (body.seo_permalink !== undefined) update.seo_permalink = body.seo_permalink ? toSlug(String(body.seo_permalink)) : null

  const { data, error: dbError } = await supabase
    .from('categories')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (dbError || !data) return NextResponse.json({ error: 'Failed to update' }, { status: 500 })

  syncCategory(data).catch(console.error)
  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: Params) {
  const { error } = await requireAdminSession()
  if (error) return error
  const { id } = await params
  const supabase = createServiceRoleClient()

  // Block delete if products or gallery items reference this category
  const [{ count: productCount, data: productRows }, { count: galleryCount }] = await Promise.all([
    supabase.from('products').select('name', { count: 'exact' }).eq('category_id', id).limit(5),
    supabase.from('gallery').select('id', { count: 'exact' }).eq('category_id', id).limit(1),
  ])

  const total = (productCount ?? 0) + (galleryCount ?? 0)
  if (total > 0) {
    const productNames = (productRows ?? []).map((p: { name: string }) => p.name)
    return NextResponse.json(
      { error: 'Cannot delete category with assigned items', productCount: productCount ?? 0, productNames, galleryCount: galleryCount ?? 0 },
      { status: 400 }
    )
  }

  // Fetch square_category_id before deleting
  const { data: cat } = await supabase.from('categories').select('square_category_id').eq('id', id).single()

  const { error: dbError } = await supabase.from('categories').delete().eq('id', id)
  if (dbError) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })

  // Await Square delete — log failure but don't fail the response
  if (cat?.square_category_id) {
    try {
      await deleteSquareCategory(cat.square_category_id)
    } catch (err) {
      console.error('Square category delete failed after DB delete:', err)
    }
  }

  return NextResponse.json({ success: true })
}
