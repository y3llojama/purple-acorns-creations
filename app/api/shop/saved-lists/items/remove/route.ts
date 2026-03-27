import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isValidUuid } from '@/lib/validate'
import { checkRate, rateLimitResponse } from '@/lib/saved-lists-rate-limit'

export async function POST(request: Request) {
  if (!checkRate(request, 'list-items-remove', 30, 60_000)) return rateLimitResponse()

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

  // Find list by token (owner) or edit_token (collaborator)
  let { data: list } = await supabase
    .from('saved_lists')
    .select('id, is_snapshot')
    .eq('token', token)
    .single()

  if (!list) {
    const { data: editList } = await supabase
      .from('saved_lists')
      .select('id, is_snapshot')
      .eq('edit_token', token)
      .single()
    list = editList
  }

  if (!list) {
    return NextResponse.json({ error: 'List not found' }, { status: 404 })
  }

  if (list.is_snapshot) {
    return NextResponse.json({ error: 'Cannot modify a snapshot list' }, { status: 403 })
  }

  const { error } = await supabase
    .from('saved_list_items')
    .delete()
    .eq('list_id', list.id)
    .eq('product_id', product_id)

  if (error) {
    return NextResponse.json({ error: 'Failed to remove item' }, { status: 500 })
  }

  await supabase
    .from('saved_lists')
    .update({ updated_at: new Date().toISOString(), last_accessed_at: new Date().toISOString() })
    .eq('id', list.id)

  return NextResponse.json({ success: true })
}
