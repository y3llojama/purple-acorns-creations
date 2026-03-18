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
    .select('created_at')
    .eq('event_type', 'page_view')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true })

  // Aggregate by day
  const dayCounts: Record<string, number> = {}
  for (const row of rows ?? []) {
    const day = row.created_at.slice(0, 10) // YYYY-MM-DD
    dayCounts[day] = (dayCounts[day] ?? 0) + 1
  }

  // Fill in missing days with zero
  const result: { date: string; views: number }[] = []
  const cursor = new Date(since)
  const today = new Date()
  today.setHours(23, 59, 59, 999)

  while (cursor <= today) {
    const dateStr = cursor.toISOString().slice(0, 10)
    result.push({ date: dateStr, views: dayCounts[dateStr] ?? 0 })
    cursor.setDate(cursor.getDate() + 1)
  }

  return NextResponse.json(result)
}
