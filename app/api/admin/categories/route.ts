import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { sanitizeText } from '@/lib/sanitize'
import { syncCategory } from '@/lib/channels'

const VALID_CATEGORY_TYPES = ['REGULAR_CATEGORY', 'MENU_CATEGORY'] as const

function toSlug(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error

  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase
    .from('categories')
    .select(`
      *,
      product_count:products(count)
    `)
    .order('sort_order', { ascending: true })

  if (dbError) return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })

  // Normalize Supabase aggregate count format and nest children
  const rows = (data ?? []).map((c: Record<string, unknown>) => ({
    ...c,
    product_count: Array.isArray(c.product_count) ? (c.product_count[0] as { count: number })?.count ?? 0 : 0,
  }))

  const topLevel = rows.filter((c: Record<string, unknown>) => !c.parent_id).map((parent: Record<string, unknown>) => ({
    ...parent,
    children: rows.filter((c: Record<string, unknown>) => c.parent_id === parent.id),
  }))

  return NextResponse.json(topLevel)
}

export async function POST(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const name = sanitizeText(String(body.name ?? '').trim())
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const categoryType = body.category_type ?? 'REGULAR_CATEGORY'
  if (!VALID_CATEGORY_TYPES.includes(categoryType)) {
    return NextResponse.json({ error: `category_type must be one of: ${VALID_CATEGORY_TYPES.join(', ')}` }, { status: 400 })
  }

  const slug = toSlug(name)
  const supabase = createServiceRoleClient()

  // Check slug collision
  const { data: existing } = await supabase.from('categories').select('id').eq('slug', slug).single()
  if (existing) return NextResponse.json({ error: 'A category with this name already exists.' }, { status: 409 })

  // Validate parent (must be top-level — no grandchildren)
  const parentId: string | null = body.parent_id ?? null
  if (parentId) {
    const { data: parent } = await supabase.from('categories').select('parent_id').eq('id', parentId).single()
    if (!parent) return NextResponse.json({ error: 'parent_id not found' }, { status: 400 })
    if (parent.parent_id) return NextResponse.json({ error: 'parent must be a top-level category (no grandchildren)' }, { status: 400 })
  }

  // Compute sort_order: max among siblings + 1
  const siblingsQuery = supabase
    .from('categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
  const { data: siblings } = parentId
    ? await siblingsQuery.eq('parent_id', parentId)
    : await siblingsQuery.is('parent_id', null)
  const sortOrder = siblings?.[0] ? (siblings[0] as { sort_order: number }).sort_order + 1 : 0

  const { data, error: dbError } = await supabase
    .from('categories')
    .insert({
      name,
      slug,
      parent_id: parentId,
      sort_order: sortOrder,
      category_type: categoryType,
      online_visibility: body.online_visibility !== false,
      seo_title: body.seo_title ? sanitizeText(String(body.seo_title)) : null,
      seo_description: body.seo_description ? sanitizeText(String(body.seo_description)) : null,
      seo_permalink: body.seo_permalink ? toSlug(String(body.seo_permalink)) : null,
    })
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: 'Failed to create' }, { status: 500 })

  syncCategory(data).catch(console.error)

  return NextResponse.json(data, { status: 201 })
}
