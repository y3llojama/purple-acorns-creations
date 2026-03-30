import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { cleanupOldLogs } from '@/lib/channels/square/logger'

export async function GET(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '50', 10))

  const supabase = createServiceRoleClient()

  // Clean up old logs opportunistically
  await cleanupOldLogs()

  const { data: logs, error: dbError } = await supabase
    .from('square_api_log')
    .select('id, created_at, method, path, status_code, error, request_body, response_body, duration_ms')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ logs })
}

export async function DELETE() {
  const { error } = await requireAdminSession()
  if (error) return error

  const supabase = createServiceRoleClient()
  await supabase.from('square_api_log').delete().gte('id', '00000000-0000-0000-0000-000000000000')

  return NextResponse.json({ cleared: true })
}
