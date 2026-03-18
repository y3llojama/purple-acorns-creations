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

  // Total page views in period
  const { count: totalViews } = await supabase
    .from('analytics_events')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', 'page_view')
    .gte('created_at', since.toISOString())

  // Unique visitors (distinct ip_hash) in period
  const { data: visitorRows } = await supabase
    .from('analytics_events')
    .select('ip_hash')
    .eq('event_type', 'page_view')
    .gte('created_at', since.toISOString())

  const uniqueVisitors = new Set(visitorRows?.map(r => r.ip_hash)).size

  // Top page
  const { data: pageRows } = await supabase
    .from('analytics_events')
    .select('page_path')
    .eq('event_type', 'page_view')
    .gte('created_at', since.toISOString())

  const pageCounts: Record<string, number> = {}
  for (const row of pageRows ?? []) {
    const p = row.page_path ?? '(unknown)'
    pageCounts[p] = (pageCounts[p] ?? 0) + 1
  }
  const topPage = Object.entries(pageCounts).sort((a, b) => b[1] - a[1])[0] ?? null

  // Top referrer
  const { data: refRows } = await supabase
    .from('analytics_events')
    .select('referrer')
    .eq('event_type', 'page_view')
    .gte('created_at', since.toISOString())
    .not('referrer', 'is', null)

  const refCounts: Record<string, number> = {}
  for (const row of refRows ?? []) {
    const r = row.referrer ?? '(direct)'
    refCounts[r] = (refCounts[r] ?? 0) + 1
  }
  const topReferrer = Object.entries(refCounts).sort((a, b) => b[1] - a[1])[0] ?? null

  // Contact form submissions in period
  const { count: contactSubmissions } = await supabase
    .from('analytics_events')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', 'contact_submit')
    .gte('created_at', since.toISOString())

  return NextResponse.json({
    totalViews: totalViews ?? 0,
    uniqueVisitors,
    topPage: topPage ? { path: topPage[0], views: topPage[1] } : null,
    topReferrer: topReferrer ? { source: topReferrer[0], count: topReferrer[1] } : null,
    contactSubmissions: contactSubmissions ?? 0,
  })
}
