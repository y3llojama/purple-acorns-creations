import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error

  const supabase = createServiceRoleClient()
  const { count, error: dbError } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('is_read', false)

  if (dbError) return NextResponse.json({ error: 'Failed to fetch count' }, { status: 500 })
  return NextResponse.json({ count: count ?? 0 })
}
