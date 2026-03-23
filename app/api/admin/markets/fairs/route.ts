// Despite the path name, returns a combined flat array of IDs from both tables.
// DiscoveryProvider only needs the array length to detect new rows.
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error
  const supabase = createServiceRoleClient()
  const [{ data: fairs }, { data: venues }] = await Promise.all([
    supabase.from('craft_fairs').select('id'),
    supabase.from('artist_venues').select('id'),
  ])
  return NextResponse.json([...(fairs ?? []), ...(venues ?? [])])
}
