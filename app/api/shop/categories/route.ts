import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/get-client-ip'

const rateMap = new Map<string, { count: number; reset: number }>()

function checkRate(ip: string): boolean {
  const now = Date.now()
  const entry = rateMap.get(ip) ?? { count: 0, reset: now + 60_000 }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000 }
  entry.count++; rateMap.set(ip, entry)
  return entry.count <= 60
}

export async function GET(request: Request) {
  const ip = getClientIp(request)
  if (!checkRate(ip)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, slug, parent_id')
    .eq('online_visibility', true)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
  return NextResponse.json(data ?? [])
}
