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
    .select('device_type')
    .eq('event_type', 'page_view')
    .gte('created_at', since.toISOString())

  const deviceCounts: Record<string, number> = { desktop: 0, mobile: 0, tablet: 0 }
  for (const row of rows ?? []) {
    const d = row.device_type ?? 'desktop'
    deviceCounts[d] = (deviceCounts[d] ?? 0) + 1
  }

  const total = Object.values(deviceCounts).reduce((a, b) => a + b, 0)
  const result = Object.entries(deviceCounts)
    .map(([device, count]) => ({
      device,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)

  return NextResponse.json(result)
}
