import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/get-client-ip'

const rateMap = new Map<string, { count: number; reset: number }>()
function checkRate(ip: string): boolean {
  const now = Date.now()
  const entry = rateMap.get(ip) ?? { count: 0, reset: now + 60_000 }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000 }
  entry.count++; rateMap.set(ip, entry)
  return entry.count <= 10
}

export async function GET(request: Request) {
  const ip = getClientIp(request)
  if (!checkRate(ip)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('settings').select('shipping_mode,shipping_value,shipping_mode_canada_mexico,shipping_value_canada_mexico,shipping_mode_intl,shipping_value_intl').limit(1).maybeSingle()
  return NextResponse.json({
    domestic: {
      shipping_mode: data?.shipping_mode ?? 'fixed',
      shipping_value: data?.shipping_value ?? 0,
    },
    canada_mexico: {
      shipping_mode: data?.shipping_mode_canada_mexico ?? 'fixed',
      shipping_value: data?.shipping_value_canada_mexico ?? 0,
    },
    intl: {
      shipping_mode: data?.shipping_mode_intl ?? 'fixed',
      shipping_value: data?.shipping_value_intl ?? 0,
    },
  })
}
