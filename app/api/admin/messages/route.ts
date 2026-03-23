import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { isValidUuid } from '@/lib/validate'

export async function GET(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const since = searchParams.get('since') ?? ''

  const supabase = createServiceRoleClient()

  // Polling mode: return only messages newer than the given timestamp
  if (since) {
    const { data, error: dbError } = await supabase
      .from('messages')
      .select('*')
      .gt('created_at', since)
      .order('created_at', { ascending: false })
    if (dbError) return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
    return NextResponse.json({ data: data ?? [], total: data?.length ?? 0 })
  }

  // Normal paginated / search mode
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const perPage = Math.min(50, Math.max(1, parseInt(searchParams.get('per_page') ?? '20', 10)))
  const q = (searchParams.get('q') ?? '').trim().slice(0, 200)
  const sort = searchParams.get('sort') === 'oldest' ? 'oldest' : 'newest'
  const emailFilter = (searchParams.get('email') ?? '').trim().slice(0, 254)
  const offset = (page - 1) * perPage

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase.from('messages').select('*', { count: 'exact' })

  if (q) {
    query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,message.ilike.%${q}%`)
  }
  if (emailFilter) {
    query = query.eq('email', emailFilter)
  }

  const { data: messages, count, error: dbError } = await query
    .order('created_at', { ascending: sort === 'oldest' })
    .range(offset, offset + perPage - 1)

  if (dbError) return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 })
  return NextResponse.json({ data: messages ?? [], total: count ?? 0, page, per_page: perPage })
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
