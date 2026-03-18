import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { isValidUuid } from '@/lib/validate'

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error

  const supabase = createServiceRoleClient()
  const { data: messages, error: dbError } = await supabase
    .from('messages')
    .select('*')
    .order('created_at', { ascending: false })

  if (dbError) return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
  return NextResponse.json(messages)
}

export async function PATCH(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const id = String(body.id ?? '')

  if (!id || !isValidUuid(id)) {
    return NextResponse.json({ error: 'Valid id required' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const { data, error: dbError } = await supabase
    .from('messages')
    .update({ is_read: Boolean(body.is_read) })
    .eq('id', id)
    .select()
    .single()

  if (dbError) return NextResponse.json({ error: 'Failed to update message' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const id = String(body.id ?? '')

  if (!id || !isValidUuid(id)) {
    return NextResponse.json({ error: 'Valid id required' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const { error: dbError } = await supabase.from('messages').delete().eq('id', id)
  if (dbError) return NextResponse.json({ error: 'Failed to delete message' }, { status: 500 })
  return NextResponse.json({ success: true })
}
