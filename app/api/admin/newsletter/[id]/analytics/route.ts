import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isValidUuid } from '@/lib/validate'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  const { error } = await requireAdminSession()
  if (error) return error

  const { id } = await params
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid newsletter id.' }, { status: 400 })
  }
  const supabase = createServiceRoleClient()

  // Fetch newsletter for slug and sent_at
  const { data: newsletter, error: nlError } = await supabase
    .from('newsletters')
    .select('slug, sent_at')
    .eq('id', id)
    .single()

  if (nlError?.code === 'PGRST116') return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  if (nlError) return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })

  // Parallel stats queries
  const [sendLogResult, analyticsViewsResult, analyticsUTMResult] = await Promise.all([
    supabase
      .from('newsletter_send_log')
      .select('status, opened_at, clicked_at')
      .eq('newsletter_id', id),
    supabase
      .from('analytics_events')
      .select('id', { count: 'exact', head: true })
      .eq('page_path', `/newsletter/${newsletter.slug}`),
    supabase
      .from('analytics_events')
      .select('id', { count: 'exact', head: true })
      .filter('metadata->>utm_campaign', 'eq', newsletter.slug),
  ])

  const logs = sendLogResult.data ?? []
  const sentLogs = logs.filter((l) => l.status === 'sent')
  const sentCount = sentLogs.length
  const openCount = sentLogs.filter((l) => l.opened_at !== null).length
  const clickCount = sentLogs.filter((l) => l.clicked_at !== null).length

  // Unsubscribes within 7 days of sent_at
  let unsubscribes = 0
  if (newsletter.sent_at) {
    const windowEnd = new Date(new Date(newsletter.sent_at).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('newsletter_subscribers')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'unsubscribed')
      .gte('unsubscribed_at', newsletter.sent_at)
      .lte('unsubscribed_at', windowEnd)
    unsubscribes = count ?? 0
  }

  return NextResponse.json({
    sent_count: sentCount,
    open_rate: sentCount > 0 ? openCount / sentCount : 0,
    click_rate: sentCount > 0 ? clickCount / sentCount : 0,
    unsubscribes,
    page_views: analyticsViewsResult.count ?? 0,
    attributed_traffic: analyticsUTMResult.count ?? 0,
  })
}
