import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const items: unknown[] = Array.isArray(body.items) ? body.items : []

  if (items.length > 100) return NextResponse.json({ error: 'Too many items' }, { status: 400 })

  for (const item of items) {
    if (typeof item !== 'object' || item === null) return NextResponse.json({ error: 'Invalid item' }, { status: 400 })
    const { id, sort_order } = item as Record<string, unknown>
    if (typeof id !== 'string' || !UUID_RE.test(id)) return NextResponse.json({ error: `Invalid UUID: ${id}` }, { status: 400 })
    if (typeof sort_order !== 'number' || !Number.isInteger(sort_order) || sort_order < 0 || sort_order > 9999) {
      return NextResponse.json({ error: `sort_order out of range for ${id}` }, { status: 400 })
    }
  }

  const supabase = createServiceRoleClient()
  const now = new Date().toISOString()

  await Promise.all(
    (items as Array<{ id: string; sort_order: number }>).map(({ id, sort_order }) =>
      supabase.from('categories').update({ sort_order, updated_at: now }).eq('id', id)
    )
  )

  return NextResponse.json({ success: true })
}
