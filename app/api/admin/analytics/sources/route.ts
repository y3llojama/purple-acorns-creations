import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { periodToDate } from '@/lib/analytics'

/** Normalize a referrer URL to a readable source label */
function normalizeReferrer(ref: string): string {
  if (!ref) return 'Direct'
  try {
    const host = new URL(ref).hostname.replace(/^www\./, '')
    // Common social media mappings
    if (host.includes('instagram.com')) return 'Instagram'
    if (host.includes('facebook.com') || host.includes('fb.com')) return 'Facebook'
    if (host.includes('twitter.com') || host.includes('x.com')) return 'X / Twitter'
    if (host.includes('pinterest.com')) return 'Pinterest'
    if (host.includes('tiktok.com')) return 'TikTok'
    if (host.includes('etsy.com')) return 'Etsy'
    if (host.includes('google.')) return 'Google'
    if (host.includes('bing.com')) return 'Bing'
    if (host.includes('duckduckgo.com')) return 'DuckDuckGo'
    return host
  } catch {
    return ref.slice(0, 50)
  }
}

export async function GET(request: NextRequest) {
  const { error } = await requireAdminSession()
  if (error) return error

  const period = request.nextUrl.searchParams.get('period') ?? '7d'
  const since = periodToDate(period)

  const supabase = createServiceRoleClient()
  const { data: rows } = await supabase
    .from('analytics_events')
    .select('referrer')
    .eq('event_type', 'page_view')
    .gte('created_at', since.toISOString())

  const sourceCounts: Record<string, number> = {}
  for (const row of rows ?? []) {
    const source = normalizeReferrer(row.referrer ?? '')
    sourceCounts[source] = (sourceCounts[source] ?? 0) + 1
  }

  const sorted = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([source, count]) => ({ source, count }))

  return NextResponse.json(sorted)
}
