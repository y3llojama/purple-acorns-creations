import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { isValidHttpsUrl } from '@/lib/validate'

const MAX_PHOTOS = 10

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error
  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase
    .from('follow_along_photos')
    .select('*')
    .order('display_order')
  if (dbError) return NextResponse.json({ error: 'Failed to load photos' }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const url = String(body.url ?? '')
  if (!isValidHttpsUrl(url)) return NextResponse.json({ error: 'Valid https image URL required' }, { status: 400 })

  const supabase = createServiceRoleClient()

  // Enforce max photo limit
  const { count } = await supabase
    .from('follow_along_photos')
    .select('*', { count: 'exact', head: true })
  if ((count ?? 0) >= MAX_PHOTOS) {
    return NextResponse.json({ error: `Maximum ${MAX_PHOTOS} photos allowed` }, { status: 400 })
  }

  // Get next display_order
  const { data: last } = await supabase
    .from('follow_along_photos')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextOrder = (last?.display_order ?? -1) + 1

  const { data, error: dbError } = await supabase
    .from('follow_along_photos')
    .insert({ storage_path: url, display_order: nextOrder })
    .select()
    .single()
  if (dbError) return NextResponse.json({ error: 'Failed to add photo' }, { status: 500 })
  revalidatePath('/', 'layout')
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const update: Record<string, number> = {}
  if (body.display_order !== undefined) {
    update.display_order = Number(body.display_order) || 0
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase
    .from('follow_along_photos')
    .update(update)
    .eq('id', String(body.id))
    .select()
    .single()
  if (dbError) return NextResponse.json({ error: 'Failed to update photo' }, { status: 500 })
  revalidatePath('/', 'layout')
  return NextResponse.json(data)
}

export async function DELETE(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const supabase = createServiceRoleClient()

  // Get storage_path before deleting to clean up storage
  const { data: photo } = await supabase
    .from('follow_along_photos')
    .select('storage_path')
    .eq('id', String(body.id))
    .single()

  const { error: dbError } = await supabase
    .from('follow_along_photos')
    .delete()
    .eq('id', String(body.id))
  if (dbError) return NextResponse.json({ error: 'Failed to delete photo' }, { status: 500 })
  revalidatePath('/', 'layout')

  // Try to clean up storage file (best-effort)
  if (photo?.storage_path) {
    try {
      const url = new URL(photo.storage_path)
      const pathMatch = url.pathname.match(/\/storage\/v1\/object\/public\/gallery\/(.+)/)
      if (pathMatch) {
        await supabase.storage.from('gallery').remove([pathMatch[1]])
      }
    } catch { /* storage cleanup is best-effort */ }
  }

  return NextResponse.json({ success: true })
}
