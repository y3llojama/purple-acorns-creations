import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('settings').select('shipping_mode,shipping_value').limit(1).maybeSingle()
  return NextResponse.json({
    shipping_mode: data?.shipping_mode ?? 'fixed',
    shipping_value: data?.shipping_value ?? 0,
  })
}
