import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { isValidHttpsUrl, clampLength } from '@/lib/validate'
import { sanitizeText } from '@/lib/sanitize'

type TableName = 'craft_fairs' | 'artist_venues'

function resolveTable(url: string): TableName | null {
  const param = new URL(url).searchParams.get('table')
  if (param === 'fairs') return 'craft_fairs'
  if (param === 'venues') return 'artist_venues'
  return null
}

function sanitizeUrls(body: Record<string, unknown>) {
  return {
    website_url: body.website_url ? (isValidHttpsUrl(String(body.website_url)) ? String(body.website_url) : null) : null,
    instagram_url: body.instagram_url ? (isValidHttpsUrl(String(body.instagram_url)) ? String(body.instagram_url) : null) : null,
  }
}

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error
  const supabase = createServiceRoleClient()
  const [{ data: craft_fairs }, { data: artist_venues }] = await Promise.all([
    supabase.from('craft_fairs').select('*').order('name'),
    supabase.from('artist_venues').select('*').order('name'),
  ])
  return NextResponse.json({ craft_fairs: craft_fairs ?? [], artist_venues: artist_venues ?? [] })
}

export async function POST(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const table = resolveTable(request.url)
  if (!table) return NextResponse.json({ error: 'table param required: fairs or venues' }, { status: 400 })
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const name = sanitizeText(clampLength(String(body.name ?? ''), 200))
  const location = sanitizeText(clampLength(String(body.location ?? ''), 300))
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (!location) return NextResponse.json({ error: 'location required' }, { status: 400 })
  const { website_url, instagram_url } = sanitizeUrls(body)
  const notes = body.notes ? sanitizeText(clampLength(String(body.notes), 1000)) || null : null
  const supabase = createServiceRoleClient()
  const shared = { name, location, website_url, instagram_url, notes }

  if (table === 'craft_fairs') {
    const { data, error: dbError } = await supabase.from('craft_fairs').insert({
      ...shared,
      years_in_operation: body.years_in_operation ? sanitizeText(clampLength(String(body.years_in_operation), 100)) || null : null,
      avg_artists: body.avg_artists ? sanitizeText(clampLength(String(body.avg_artists), 100)) || null : null,
      avg_shoppers: body.avg_shoppers ? sanitizeText(clampLength(String(body.avg_shoppers), 100)) || null : null,
      typical_months: body.typical_months ? sanitizeText(clampLength(String(body.typical_months), 200)) || null : null,
    }).select().single()
    if (dbError) return NextResponse.json({ error: 'Failed to create fair' }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  } else {
    const { data, error: dbError } = await supabase.from('artist_venues').insert({
      ...shared,
      hosting_model: body.hosting_model ? sanitizeText(clampLength(String(body.hosting_model), 200)) || null : null,
    }).select().single()
    if (dbError) return NextResponse.json({ error: 'Failed to create venue' }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }
}

export async function PUT(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const table = resolveTable(request.url)
  if (!table) return NextResponse.json({ error: 'table param required: fairs or venues' }, { status: 400 })
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const { id, ...fields } = body as { id?: string } & Record<string, unknown>
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const update: Record<string, string | null> = {}
  if (fields.name !== undefined) update.name = sanitizeText(clampLength(String(fields.name), 200))
  if (fields.location !== undefined) update.location = sanitizeText(clampLength(String(fields.location), 300))
  if (fields.website_url !== undefined) update.website_url = fields.website_url ? (isValidHttpsUrl(String(fields.website_url)) ? String(fields.website_url) : null) : null
  if (fields.instagram_url !== undefined) update.instagram_url = fields.instagram_url ? (isValidHttpsUrl(String(fields.instagram_url)) ? String(fields.instagram_url) : null) : null
  if (fields.notes !== undefined) update.notes = fields.notes ? sanitizeText(clampLength(String(fields.notes), 1000)) || null : null
  if (table === 'craft_fairs') {
    if (fields.years_in_operation !== undefined) update.years_in_operation = fields.years_in_operation ? sanitizeText(clampLength(String(fields.years_in_operation), 100)) || null : null
    if (fields.avg_artists !== undefined) update.avg_artists = fields.avg_artists ? sanitizeText(clampLength(String(fields.avg_artists), 100)) || null : null
    if (fields.avg_shoppers !== undefined) update.avg_shoppers = fields.avg_shoppers ? sanitizeText(clampLength(String(fields.avg_shoppers), 100)) || null : null
    if (fields.typical_months !== undefined) update.typical_months = fields.typical_months ? sanitizeText(clampLength(String(fields.typical_months), 200)) || null : null
  } else {
    if (fields.hosting_model !== undefined) update.hosting_model = fields.hosting_model ? sanitizeText(clampLength(String(fields.hosting_model), 200)) || null : null
  }
  const supabase = createServiceRoleClient()
  const { error: dbError } = await supabase.from(table).update(update).eq('id', id)
  if (dbError) return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const table = resolveTable(request.url)
  if (!table) return NextResponse.json({ error: 'table param required: fairs or venues' }, { status: 400 })
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const supabase = createServiceRoleClient()
  const { error: dbError } = await supabase.from(table).delete().eq('id', String(body.id))
  if (dbError) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  return NextResponse.json({ success: true })
}
