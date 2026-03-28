import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { periodToDate } from '@/lib/analytics'

export async function GET(request: NextRequest) {
  const { error } = await requireAdminSession()
  if (error) return error

  const period = request.nextUrl.searchParams.get('period') ?? '7d'
  const since = periodToDate(period)

  const supabase = createServiceRoleClient()

  const { data, error: rpcError } = await supabase.rpc('analytics_summary', {
    since: since.toISOString(),
  })

  if (rpcError) {
    console.error('[analytics/summary] RPC error:', rpcError.message)
    return NextResponse.json(
      { error: 'Failed to load analytics summary' },
      { status: 500 },
    )
  }

  return NextResponse.json(data)
}
