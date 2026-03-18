import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { sanitizeText } from '@/lib/sanitize'

export async function POST(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const key = sanitizeText(String(body.key ?? ''))
  const value = String(body.value ?? '') // Store raw value; sanitized on render

  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })

  const supabase = createServiceRoleClient()
  const { error: dbError } = await supabase
    .from('content')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })

  if (dbError) return NextResponse.json({ error: 'Failed to update content' }, { status: 500 })
  return NextResponse.json({ success: true })
}
