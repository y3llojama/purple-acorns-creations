import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

const rateMap = new Map<string, { count: number; reset: number }>()
function checkRate(ip: string): boolean {
  const now = Date.now()
  const entry = rateMap.get(ip) ?? { count: 0, reset: now + 60_000 }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000 }
  entry.count++; rateMap.set(ip, entry)
  return entry.count <= 10
}

export async function GET(request: Request) {
  const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
  if (!checkRate(ip)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('settings').select('shipping_mode,shipping_value').limit(1).maybeSingle()
  return NextResponse.json({
    shipping_mode: data?.shipping_mode ?? 'fixed',
    shipping_value: data?.shipping_value ?? 0,
  })
}
