import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/get-client-ip'

const rateMap = new Map<string, number>()

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Rate limit: 1 view increment per IP per 60s
  const ip = getClientIp(_req)
  const now = Date.now()
  if ((rateMap.get(ip) ?? 0) > now - 60_000) {
    return NextResponse.json({ ok: true }) // silently ignore, don't 429 view counts
  }
  rateMap.set(ip, now)

  const { id } = await params
  const supabase = createServiceRoleClient()
  // Atomic increment via SQL to avoid read-modify-write race
  await supabase.rpc('increment_view_count', { product_id: id })
  return NextResponse.json({ ok: true })
}
