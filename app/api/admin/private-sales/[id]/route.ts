import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminSession()
  if (error) return error

  const { id } = await params
  const supabase = createServiceRoleClient()

  const { data: sale } = await supabase.from('private_sales').select('id,used_at,revoked_at').eq('id', id).maybeSingle()
  if (!sale) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (sale.used_at || sale.revoked_at) return NextResponse.json({ error: 'Link is already used or revoked' }, { status: 409 })

  const { error: rpcError } = await supabase.rpc('release_private_sale_stock', { sale_id: id })
  if (rpcError) return NextResponse.json({ error: 'Failed to revoke' }, { status: 500 })

  return NextResponse.json({ success: true })
}
