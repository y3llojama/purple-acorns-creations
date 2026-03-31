import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { sanitizeText } from '@/lib/sanitize'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminSession()
  if (error) return error
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) {
    const name = sanitizeText(String(body.name).trim())
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
    update.name = name
    update.display_name = name
  }
  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase
    .from('item_options').update(update).eq('id', id).select().single()
  if (dbError || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Sync values if provided: add new, update existing, remove missing
  if (Array.isArray(body.values)) {
    const incomingIds: string[] = []
    for (let i = 0; i < Math.min(body.values.length, 20); i++) {
      const v = body.values[i]
      const valName = sanitizeText(String(v?.name ?? v ?? '').trim())
      if (!valName) continue
      if (v?.id) {
        incomingIds.push(v.id)
        await supabase.from('item_option_values')
          .update({ name: valName, sort_order: i, updated_at: new Date().toISOString() })
          .eq('id', v.id).eq('option_id', id)
      } else {
        const { data: newVal } = await supabase.from('item_option_values')
          .insert({ option_id: id, name: valName, sort_order: i })
          .select('id').single()
        if (newVal) incomingIds.push(newVal.id)
      }
    }
    // Remove values no longer in list (only if no variation references)
    const { data: allVals } = await supabase
      .from('item_option_values').select('id').eq('option_id', id)
    for (const val of (allVals ?? [])) {
      if (!incomingIds.includes(val.id)) {
        const { data: refs } = await supabase
          .from('variation_option_values').select('variation_id').eq('option_value_id', val.id).limit(1)
        if (!refs?.length) {
          await supabase.from('item_option_values').delete().eq('id', val.id)
        }
      }
    }
  }

  return NextResponse.json(data)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminSession()
  if (error) return error
  const { id } = await params
  const supabase = createServiceRoleClient()
  // Check if option is in use by any product
  const { data: usage } = await supabase
    .from('product_options').select('product_id').eq('option_id', id).limit(1)
  if (usage?.length) {
    return NextResponse.json({ error: 'Option is in use by products. Remove it from all products first.' }, { status: 409 })
  }
  const { error: dbError } = await supabase.from('item_options').delete().eq('id', id)
  if (dbError) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  return NextResponse.json({ success: true })
}
