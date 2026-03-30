import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error
  const supabase = createServiceRoleClient()
  const [{ data: settings, error: settingsError }, { data: conflicts }, { data: recentErrors }] = await Promise.all([
    supabase.from('settings').select('square_sync_enabled,pinterest_sync_enabled,square_location_id,pinterest_catalog_id,square_access_token,pinterest_access_token,square_application_id,square_application_secret,square_environment,square_log_level,square_log_expires_at').single(),
    supabase.from('channel_sync_log').select('product_id,channel,error,created_at,products(name)').eq('status', 'conflict'),
    supabase.from('channel_sync_log').select('product_id,channel,error,created_at').eq('status', 'error').order('created_at', { ascending: false }).limit(10),
  ])
  if (settingsError) console.error('[channels] settings query error:', settingsError.message)
  console.log('[channels] hasAppCredentials:', !!(settings?.square_application_id && settings?.square_application_secret), 'appId:', !!settings?.square_application_id, 'secret:', !!settings?.square_application_secret)
  const allConflicts = conflicts ?? []
  const allErrors = recentErrors ?? []
  return NextResponse.json({
    square: {
      status: {
        connected: !!settings?.square_access_token,
        enabled: settings?.square_sync_enabled ?? false,
        locationId: settings?.square_location_id ?? null,
        hasAppCredentials: !!(settings?.square_application_id && settings?.square_application_secret),
        environment: settings?.square_environment ?? (process.env.SQUARE_ENVIRONMENT ?? 'sandbox'),
        logLevel: settings?.square_log_level ?? 'none',
        logExpiresAt: settings?.square_log_expires_at ?? null,
      },
      conflicts: allConflicts.filter(c => c.channel === 'square'),
      recentErrors: allErrors.filter(e => e.channel === 'square'),
    },
    pinterest: {
      status: { connected: !!settings?.pinterest_access_token, enabled: settings?.pinterest_sync_enabled ?? false, catalogId: settings?.pinterest_catalog_id ?? null },
      conflicts: allConflicts.filter(c => c.channel === 'pinterest'),
      recentErrors: allErrors.filter(e => e.channel === 'pinterest'),
    },
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
  if (Object.keys(update).length > 0) {
    const { data: row } = await supabase.from('settings').select('id').limit(1).maybeSingle()
    if (row) await supabase.from('settings').update(update).eq('id', row.id)
  }
  if (body.dismiss_conflict_product_id && body.dismiss_conflict_channel) {
    await supabase.from('channel_sync_log')
      .update({ status: 'synced', error: null })
      .eq('product_id', body.dismiss_conflict_product_id)
      .eq('channel', body.dismiss_conflict_channel)
  }
  return NextResponse.json({ ok: true })
}
