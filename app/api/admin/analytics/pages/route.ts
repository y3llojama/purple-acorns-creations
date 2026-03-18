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
  const { data: rows } = await supabase
    .from('analytics_events')
    .select('page_path')
    .eq('event_type', 'page_view')
    .gte('created_at', since.toISOString())

  const pageCounts: Record<string, number> = {}
  for (const row of rows ?? []) {
    const p = row.page_path ?? '(unknown)'
    pageCounts[p] = (pageCounts[p] ?? 0) + 1
  }

  const sorted = Object.entries(pageCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([path, views]) => ({ path, views }))

  return NextResponse.json(sorted)
}
