import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/get-client-ip'

// Simple in-memory rate limit — 60 requests/min per IP
const rateLimitMap = new Map<string, number>()
const PRUNE_INTERVAL = 5 * 60_000
const RATE_WINDOW = 60_000
let lastPrune = Date.now()

function pruneRateLimitMap() {
  const now = Date.now()
  if (now - lastPrune < PRUNE_INTERVAL) return
  lastPrune = now
  for (const [ip, ts] of rateLimitMap) {
    if (now - ts > RATE_WINDOW) rateLimitMap.delete(ip)
  }
}

export async function GET(request: Request) {
  pruneRateLimitMap()
  const ip = getClientIp(request)
  const now = Date.now()
  const last = rateLimitMap.get(ip) ?? 0
  if (now - last < RATE_WINDOW) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  rateLimitMap.set(ip, now)

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('gallery')
    .select('id, url, alt_text, category, square_url')
    .order('sort_order')

  if (error) {
    return NextResponse.json({ error: 'Failed to load catalog' }, { status: 500 })
  }

  return NextResponse.json({ items: data ?? [] }, {
    headers: {
      // Cache for 5 minutes — stale-while-revalidate for 30s
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=30',
    },
  })
}
