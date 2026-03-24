import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { isValidHttpsUrl } from '@/lib/validate'
import { sanitizeText } from '@/lib/sanitize'

export async function GET(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase
    .from('hero_slides')
    .select('id, url, alt_text, sort_order')
    .order('sort_order')
  if (dbError) return NextResponse.json({ error: 'Failed to fetch slides' }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const url = String(body.url ?? '')
  const alt_text = sanitizeText(String(body.alt_text ?? '')).slice(0, 300)
  if (!isValidHttpsUrl(url)) return NextResponse.json({ error: 'Valid https image URL required' }, { status: 400 })
  if (!alt_text) return NextResponse.json({ error: 'Alt text required for accessibility' }, { status: 400 })
  const sort_order = Number(body.sort_order) || 0
  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase
    .from('hero_slides')
    .insert({ url, alt_text, sort_order })
    .select('id, url, alt_text, sort_order')
    .single()
  if (dbError) return NextResponse.json({ error: 'Failed to add slide' }, { status: 500 })
  revalidatePath('/', 'layout')
  return NextResponse.json(data, { status: 201 })
}
