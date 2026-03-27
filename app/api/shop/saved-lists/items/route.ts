import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isValidUuid } from '@/lib/validate'
import { checkRate, rateLimitResponse } from '@/lib/saved-lists-rate-limit'

export async function POST(request: Request) {
  if (!checkRate(request, 'list-items', 30, 60_000)) return rateLimitResponse()

  let body: { token?: string; product_id?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { token, product_id } = body
  if (!token || !isValidUuid(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }
  if (!product_id || !isValidUuid(product_id)) {
    return NextResponse.json({ error: 'Invalid product_id' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  // Validate product exists and is active
  const { data: product } = await supabase
    .from('products')
    .select('id, is_active')
    .eq('id', product_id)
    .single()

  if (!product || !product.is_active) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  // Find or lazily create list
  let { data: list } = await supabase
    .from('saved_lists')
    .select('id, is_snapshot')
    .eq('token', token)
    .single()

  if (!list) {
    if (!checkRate(request, 'list-create', 5, 3_600_000)) return rateLimitResponse()

    const { data: newList, error: createError } = await supabase
      .from('saved_lists')
      .insert({ token })
      .select('id, is_snapshot')
      .single()

    if (createError || !newList) {
      return NextResponse.json({ error: 'Failed to create list' }, { status: 500 })
    }
    list = newList
  }

  if (list.is_snapshot) {
    return NextResponse.json({ error: 'Cannot modify a snapshot list' }, { status: 403 })
  }

  // Check item count cap
  const { count } = await supabase
    .from('saved_list_items')
    .select('id', { count: 'exact', head: true })
    .eq('list_id', list.id)

  if ((count ?? 0) >= 200) {
    return NextResponse.json({ error: 'List is full (max 200 items)' }, { status: 422 })
  }

  const { error: insertError } = await supabase
    .from('saved_list_items')
    .upsert(
      { list_id: list.id, product_id },
      { onConflict: 'list_id,product_id', ignoreDuplicates: true }
    )

  if (insertError) {
    return NextResponse.json({ error: 'Failed to add item' }, { status: 500 })
  }

  await supabase
    .from('saved_lists')
    .update({ updated_at: new Date().toISOString(), last_accessed_at: new Date().toISOString() })
    .eq('id', list.id)

  return NextResponse.json({ success: true })
}
