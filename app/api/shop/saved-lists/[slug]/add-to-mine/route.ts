import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isValidUuid, isValidSlug } from '@/lib/validate'
import { checkRate, rateLimitResponse } from '@/lib/saved-lists-rate-limit'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!checkRate(request, 'list-add-to-mine', 20, 60_000)) return rateLimitResponse()

  const { slug } = await params
  if (!isValidSlug(slug)) {
    return NextResponse.json({ error: 'Invalid slug' }, { status: 400 })
  }

  let body: { my_token?: string; product_id?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { my_token, product_id } = body
  if (!my_token || !isValidUuid(my_token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }
  if (!product_id || !isValidUuid(product_id)) {
    return NextResponse.json({ error: 'Invalid product_id' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  const { data: sharedList } = await supabase
    .from('saved_lists')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!sharedList) {
    return NextResponse.json({ error: 'Shared list not found' }, { status: 404 })
  }

  const { data: sharedItem } = await supabase
    .from('saved_list_items')
    .select('id')
    .eq('list_id', sharedList.id)
    .eq('product_id', product_id)
    .single()

  if (!sharedItem) {
    return NextResponse.json({ error: 'Product not in shared list' }, { status: 404 })
  }

  const { data: product } = await supabase
    .from('products')
    .select('id, is_active')
    .eq('id', product_id)
    .single()

  if (!product || !product.is_active) {
    return NextResponse.json({ error: 'Product not available' }, { status: 404 })
  }

  let { data: myList } = await supabase
    .from('saved_lists')
    .select('id')
    .eq('token', my_token)
    .single()

  if (!myList) {
    if (!checkRate(request, 'list-create', 5, 3_600_000)) return rateLimitResponse()

    const { data: newList, error: createError } = await supabase
      .from('saved_lists')
      .insert({ token: my_token })
      .select('id')
      .single()

    if (createError || !newList) {
      return NextResponse.json({ error: 'Failed to create list' }, { status: 500 })
    }
    myList = newList
  }

  const { count } = await supabase
    .from('saved_list_items')
    .select('id', { count: 'exact', head: true })
    .eq('list_id', myList.id)

  if ((count ?? 0) >= 200) {
    return NextResponse.json({ error: 'Your list is full (max 200 items)' }, { status: 422 })
  }

  await supabase
    .from('saved_list_items')
    .upsert(
      { list_id: myList.id, product_id },
      { onConflict: 'list_id,product_id', ignoreDuplicates: true }
    )

  await supabase
    .from('saved_lists')
    .update({ updated_at: new Date().toISOString(), last_accessed_at: new Date().toISOString() })
    .eq('id', myList.id)

  return NextResponse.json({ success: true })
}
