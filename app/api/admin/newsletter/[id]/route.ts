import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isValidNewsletterSection } from '@/lib/newsletter'
import { sanitizeContent } from '@/lib/sanitize'
import { isValidHttpsUrl } from '@/lib/validate'
import type { NewsletterSection } from '@/lib/supabase/types'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  const { error } = await requireAdminSession()
  if (error) return error

  const { id } = await params
  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase
    .from('newsletters')
    .select('*')
    .eq('id', id)
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  return NextResponse.json({ newsletter: data })
}

export async function PUT(request: Request, { params }: RouteContext) {
  const { error } = await requireAdminSession()
  if (error) return error

  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const allowed = ['title', 'subject_line', 'teaser_text', 'hero_image_url', 'content', 'tone', 'slug', 'ai_brief']
  const updates: Record<string, unknown> = {}

  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  // Validate and sanitize
  if (updates.hero_image_url && !isValidHttpsUrl(updates.hero_image_url as string)) {
    return NextResponse.json({ error: 'Invalid hero_image_url.' }, { status: 400 })
  }
  if (updates.content) {
    const sections = updates.content as unknown[]
    if (!sections.every(isValidNewsletterSection)) {
      return NextResponse.json({ error: 'Invalid content section.' }, { status: 400 })
    }
    updates.content = sections.map((s) => {
      const sec = s as NewsletterSection
      if (sec.type === 'text') return { ...sec, body: sanitizeContent(sec.body) }
      return sec
    })
  }

  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase
    .from('newsletters')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })
  return NextResponse.json({ newsletter: data })
}
