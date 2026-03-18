import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { isValidHttpsUrl, clampLength } from '@/lib/validate'
import { sanitizeText } from '@/lib/sanitize'

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error
  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('events').select('*').order('date')
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const name = sanitizeText(clampLength(String(body.name ?? ''), 200))
  const location = sanitizeText(clampLength(String(body.location ?? ''), 300))
  const date = String(body.date ?? '')
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (!location) return NextResponse.json({ error: 'location required' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  const link_url = body.link_url ? (isValidHttpsUrl(String(body.link_url)) ? String(body.link_url) : null) : null
  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase.from('events').insert({
    name, location, date,
    time: sanitizeText(clampLength(String(body.time ?? ''), 50)) || null,
    description: sanitizeText(clampLength(String(body.description ?? ''), 1000)) || null,
    link_url,
    link_label: link_url ? sanitizeText(clampLength(String(body.link_label ?? ''), 100)) || 'Learn more' : null,
  }).select().single()
  if (dbError) return NextResponse.json({ error: 'Failed to create event' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const { id, ...fields } = body as { id?: string } & Record<string, unknown>
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const update: Record<string, string | null> = {}
  if (fields.name !== undefined) update.name = sanitizeText(clampLength(String(fields.name), 200))
  if (fields.location !== undefined) update.location = sanitizeText(clampLength(String(fields.location), 300))
  if (fields.date !== undefined) {
    const dateStr = String(fields.date)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
    update.date = dateStr
  }
  if (fields.time !== undefined) update.time = sanitizeText(clampLength(String(fields.time), 50)) || null
  if (fields.description !== undefined) update.description = sanitizeText(clampLength(String(fields.description), 1000)) || null
  if (fields.link_url !== undefined) update.link_url = fields.link_url ? (isValidHttpsUrl(String(fields.link_url)) ? String(fields.link_url) : null) : null
  if (fields.link_label !== undefined) update.link_label = sanitizeText(clampLength(String(fields.link_label), 100)) || null
  const supabase = createServiceRoleClient()
  const { error: dbError } = await supabase.from('events').update(update).eq('id', id)
  if (dbError) return NextResponse.json({ error: 'Failed to update event' }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const supabase = createServiceRoleClient()
  await supabase.from('events').delete().eq('id', String(body.id))
  return NextResponse.json({ success: true })
}
