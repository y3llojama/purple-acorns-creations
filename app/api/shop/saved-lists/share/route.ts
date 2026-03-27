import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isValidUuid } from '@/lib/validate'
import { checkRate, rateLimitResponse } from '@/lib/saved-lists-rate-limit'
import { generateSlug } from '@/lib/slug'
import crypto from 'crypto'

export async function POST(request: Request) {
  if (!checkRate(request, 'list-share', 10, 60_000)) return rateLimitResponse()

  let body: { token?: string; mode?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { token, mode } = body
  if (!token || !isValidUuid(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }
  if (mode !== 'copy' && mode !== 'live') {
    return NextResponse.json({ error: 'mode must be "copy" or "live"' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  const { data: list, error: listError } = await supabase
    .from('saved_lists')
    .select('id, slug, edit_token')
    .eq('token', token)
    .single()

  if (listError || !list) {
    return NextResponse.json({ error: 'List not found' }, { status: 404 })
  }

  // Fetch items with category names for slug generation
  const { data: items } = await supabase
    .from('saved_list_items')
    .select(`
      product_id,
      products:product_id (name, category_id, categories:category_id (name))
    `)
    .eq('list_id', list.id)

  const categoryNames = (items ?? [])
    .map((i: any) => i.products?.categories?.name)
    .filter(Boolean)
  const uniqueCategories = [...new Set(categoryNames)] as string[]
  const descriptors = uniqueCategories.length > 0
    ? uniqueCategories
    : (items ?? []).map((i: any) => i.products?.name).filter(Boolean).slice(0, 3)

  const baseUrl = request.headers.get('origin') || ''

  if (mode === 'copy') {
    const slug = generateSlug(descriptors)
    const { data: existing } = await supabase
      .from('saved_lists')
      .select('id')
      .eq('slug', slug)
      .single()
    const finalSlug = existing ? generateSlug(descriptors) : slug

    const { data: snapshot, error: snapError } = await supabase
      .from('saved_lists')
      .insert({
        slug: finalSlug,
        is_snapshot: true,
        source_list_id: list.id,
      })
      .select('id, slug')
      .single()

    if (snapError || !snapshot) {
      return NextResponse.json({ error: 'Failed to create snapshot' }, { status: 500 })
    }

    if (items && items.length > 0) {
      const itemRows = items.map((i: any) => ({
        list_id: snapshot.id,
        product_id: i.product_id,
      }))
      await supabase.from('saved_list_items').insert(itemRows)
    }

    return NextResponse.json({
      slug: snapshot.slug,
      url: `${baseUrl}/shop/saved/${snapshot.slug}`,
    })
  }

  // mode === 'live'
  if (list.slug) {
    return NextResponse.json({
      slug: list.slug,
      url: `${baseUrl}/shop/saved/${list.slug}#edit=${list.edit_token}`,
    })
  }

  const slug = generateSlug(descriptors)
  const editToken = crypto.randomUUID()
  const { data: existing } = await supabase
    .from('saved_lists')
    .select('id')
    .eq('slug', slug)
    .single()
  const finalSlug = existing ? generateSlug(descriptors) : slug

  const { error: updateError } = await supabase
    .from('saved_lists')
    .update({ slug: finalSlug, edit_token: editToken })
    .eq('id', list.id)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to share list' }, { status: 500 })
  }

  return NextResponse.json({
    slug: finalSlug,
    url: `${baseUrl}/shop/saved/${finalSlug}#edit=${editToken}`,
  })
}
