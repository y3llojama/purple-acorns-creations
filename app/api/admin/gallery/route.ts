import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { isValidHttpsUrl, clampLength } from '@/lib/validate'
import { sanitizeText } from '@/lib/sanitize'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const url = String(body.url ?? '')
  const alt_text = sanitizeText(clampLength(String(body.alt_text ?? ''), 500))
  if (!isValidHttpsUrl(url)) return NextResponse.json({ error: 'Valid https image URL required' }, { status: 400 })
  if (!alt_text) return NextResponse.json({ error: 'Alt text required for accessibility' }, { status: 400 })
  const categoryId = body.category_id && UUID_RE.test(String(body.category_id)) ? String(body.category_id) : null
  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase.from('gallery').insert({
    url, alt_text, category_id: categoryId,
    sort_order: Number(body.sort_order) || 0,
  }).select().single()
  if (dbError) return NextResponse.json({ error: 'Failed to add gallery item' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const update: Record<string, string | boolean | number | null> = {}
  if (body.url !== undefined) {
    const url = String(body.url)
    if (!isValidHttpsUrl(url)) return NextResponse.json({ error: 'Valid https image URL required' }, { status: 400 })
    update.url = url
  }
  if (body.alt_text !== undefined) {
    const alt_text = sanitizeText(clampLength(String(body.alt_text), 500))
    if (!alt_text) return NextResponse.json({ error: 'Description required for accessibility' }, { status: 400 })
    update.alt_text = alt_text
  }
  if (body.is_featured !== undefined) {
    update.is_featured = Boolean(body.is_featured)
  }
  if (body.sort_order !== undefined) {
    update.sort_order = Number(body.sort_order) || 0
  }
  if (body.square_url !== undefined) {
    const url = String(body.square_url || '')
    if (url && !isValidHttpsUrl(url)) return NextResponse.json({ error: 'Square URL must be a valid https URL' }, { status: 400 })
    update.square_url = url || null
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase.from('gallery').update(update).eq('id', String(body.id)).select().single()
  if (dbError) return NextResponse.json({ error: 'Failed to update gallery item' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const supabase = createServiceRoleClient()
  const { error: dbError } = await supabase.from('gallery').delete().eq('id', String(body.id))
  if (dbError) return NextResponse.json({ error: 'Failed to delete gallery item' }, { status: 500 })
  return NextResponse.json({ success: true })
}
