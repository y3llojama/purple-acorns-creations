import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { periodToDate } from '@/lib/analytics'

interface CampaignEntry {
  source: string
  medium: string
  campaign: string
  count: number
}

export async function GET(request: NextRequest) {
  const { error } = await requireAdminSession()
  if (error) return error

  const period = request.nextUrl.searchParams.get('period') ?? '7d'
  const since = periodToDate(period)

  const supabase = createServiceRoleClient()

  const { data } = await supabase
    .from('analytics_events')
    .select('metadata')
    .gte('created_at', since.toISOString())
    .filter('metadata->>utm_source', 'not.is', null)

  const counts: Record<string, CampaignEntry> = {}
  for (const row of data ?? []) {
    const m = row.metadata as Record<string, string> | null
    if (!m?.utm_source) continue
    const key = [m.utm_source, m.utm_medium ?? '', m.utm_campaign ?? ''].join('|')
    if (!counts[key]) {
      counts[key] = {
        source: m.utm_source,
        medium: m.utm_medium ?? '(none)',
        campaign: m.utm_campaign ?? '(none)',
        count: 0,
      }
    }
    counts[key].count++
  }

  const result = Object.values(counts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)

  return NextResponse.json(result)
}
