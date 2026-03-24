import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { hashIp, parseDeviceType, isAllowedEventType } from '@/lib/analytics'
import { clampLength, stripControlChars } from '@/lib/validate'
import { getClientIp } from '@/lib/get-client-ip'

// Rate limiter: max 30 events per IP per 60 seconds (higher than contact form since page views are frequent)
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()
const RATE_WINDOW = 60_000
const RATE_MAX = 30

// Prune stale entries every 5 minutes
const PRUNE_INTERVAL = 5 * 60_000
let lastPrune = Date.now()

function pruneRateLimitMap() {
  const now = Date.now()
  if (now - lastPrune < PRUNE_INTERVAL) return
  lastPrune = now
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_WINDOW) rateLimitMap.delete(ip)
  }
}

export async function POST(request: Request) {
  pruneRateLimitMap()

  const ip = getClientIp(request)
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (entry) {
    if (now - entry.windowStart < RATE_WINDOW) {
      if (entry.count >= RATE_MAX) {
        return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
      }
      entry.count++
    } else {
      rateLimitMap.set(ip, { count: 1, windowStart: now })
    }
  } else {
    rateLimitMap.set(ip, { count: 1, windowStart: now })
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const eventType = String(body.event_type ?? '')
  if (!isAllowedEventType(eventType)) {
    return NextResponse.json({ error: 'Invalid event_type.' }, { status: 400 })
  }

  const pagePath = stripControlChars(clampLength(String(body.page_path ?? ''), 500)) || null
  const referrer = stripControlChars(clampLength(String(body.referrer ?? ''), 1000)) || null
  const userAgent = request.headers.get('user-agent') ?? null
  const deviceType = parseDeviceType(userAgent)
  const sessionId = clampLength(String(body.session_id ?? ''), 64) || null
  const ipHash = hashIp(ip)
  // Cap metadata size to prevent DB abuse — silently drop oversized objects
  let metadata: Record<string, unknown> | null = null
  if (body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)) {
    const metaStr = JSON.stringify(body.metadata)
    if (metaStr.length <= 500) {
      metadata = body.metadata as Record<string, unknown>
    }
  }

  const supabase = createServiceRoleClient()
  const { error: dbError } = await supabase.from('analytics_events').insert({
    event_type: eventType,
    page_path: pagePath,
    referrer,
    user_agent: userAgent ? clampLength(userAgent, 500) : null,
    device_type: deviceType,
    session_id: sessionId,
    ip_hash: ipHash,
    metadata,
  })

  if (dbError) {
    console.error('[Analytics] DB error:', dbError.message)
    return NextResponse.json({ error: 'Failed to record event.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
