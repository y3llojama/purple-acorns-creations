import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const ids = body.ids
  if (!Array.isArray(ids)) return NextResponse.json({ error: 'ids must be an array' }, { status: 400 })
  if (ids.length === 0 || ids.length > 100) return NextResponse.json({ error: 'ids must have 1–100 elements' }, { status: 400 })
  for (const id of ids) {
    if (!UUID_RE.test(String(id))) return NextResponse.json({ error: `Invalid id: ${id}` }, { status: 400 })
  }
  const supabase = createServiceRoleClient()
  const updates = ids.map((id, index) =>
    supabase.from('hero_slides').update({ sort_order: index }).eq('id', String(id))
  )
  const results = await Promise.all(updates)
  const failed = results.find(r => r.error)
  if (failed?.error) return NextResponse.json({ error: 'Failed to reorder slides' }, { status: 500 })
  revalidatePath('/', 'layout')
  return NextResponse.json({ success: true })
}
