import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { generateSlug } from '@/lib/newsletter'

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error

  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase
    .from('newsletters')
    .select('id, slug, title, status, scheduled_at, sent_at, created_at')
    .order('created_at', { ascending: false })

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ newsletters: data ?? [] })
}

export async function POST() {
  const { error } = await requireAdminSession()
  if (error) return error

  const supabase = createServiceRoleClient()
  const now = new Date()
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  let slug = generateSlug('new newsletter', yearMonth)

  // Handle slug collision
  const { data: existing } = await supabase
    .from('newsletters')
    .select('slug')
    .eq('slug', slug)
    .maybeSingle()

  if (existing) {
    slug = `${slug}-${Date.now()}`
  }

  const { data, error: dbError } = await supabase
    .from('newsletters')
    .insert({ slug, title: 'New Newsletter' })
    .select('id, slug')
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ newsletter: data }, { status: 201 })
}
