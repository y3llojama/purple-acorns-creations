import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error
  const supabase = createServiceRoleClient()
  const [{ data: settings }, { data: conflicts }, { data: recentErrors }] = await Promise.all([
    supabase.from('settings').select('square_sync_enabled,pinterest_sync_enabled,square_location_id,pinterest_catalog_id,square_access_token,pinterest_access_token').single(),
    supabase.from('channel_sync_log').select('product_id,channel,error,created_at,products(name)').eq('status', 'conflict'),
    supabase.from('channel_sync_log').select('product_id,channel,error,created_at').eq('status', 'error').order('created_at', { ascending: false }).limit(10),
  ])
  return NextResponse.json({
    square: { connected: !!settings?.square_access_token, enabled: settings?.square_sync_enabled ?? false, locationId: settings?.square_location_id },
    pinterest: { connected: !!settings?.pinterest_access_token, enabled: settings?.pinterest_sync_enabled ?? false, catalogId: settings?.pinterest_catalog_id },
    conflicts: conflicts ?? [],
    recentErrors: recentErrors ?? [],
  })
}

export async function PATCH(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const supabase = createServiceRoleClient()
  const update: Record<string, unknown> = {}
  if (typeof body.square_sync_enabled === 'boolean') update.square_sync_enabled = body.square_sync_enabled
  if (typeof body.pinterest_sync_enabled === 'boolean') update.pinterest_sync_enabled = body.pinterest_sync_enabled
  if (body.pinterest_catalog_id !== undefined) update.pinterest_catalog_id = String(body.pinterest_catalog_id)
  if (Object.keys(update).length > 0) await supabase.from('settings').update(update)
  if (body.dismiss_conflict_product_id && body.dismiss_conflict_channel) {
    await supabase.from('channel_sync_log')
      .update({ status: 'synced', error: null })
      .eq('product_id', body.dismiss_conflict_product_id)
      .eq('channel', body.dismiss_conflict_channel)
  }
  return NextResponse.json({ ok: true })
}
