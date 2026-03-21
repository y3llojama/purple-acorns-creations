import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const supabase = createServiceRoleClient()
  const { data: settings } = await supabase
    .from('settings')
    .select('square_application_id, square_environment')
    .limit(1)
    .maybeSingle()

  const appId = settings?.square_application_id ?? process.env.SQUARE_APPLICATION_ID
  const environment = settings?.square_environment ?? process.env.SQUARE_ENVIRONMENT

  if (!appId) return NextResponse.json({ error: 'Square not configured' }, { status: 500 })

  const baseUrl = environment === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com'

  const redirectUri = `${(process.env.NEXT_PUBLIC_APP_URL ?? '').trim()}/api/admin/channels/square/callback`
  const scope = [
    'MERCHANT_PROFILE_READ', 'ITEMS_READ', 'ITEMS_WRITE',
    'INVENTORY_READ', 'INVENTORY_WRITE',
    'ORDERS_READ', 'ORDERS_WRITE',
    'PAYMENTS_READ', 'PAYMENTS_WRITE',
  ].join(' ')

  const url = new URL(`${baseUrl}/oauth2/authorize`)
  url.searchParams.set('client_id', appId as string)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', scope)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('session', 'false')

  return NextResponse.redirect(url.toString())
}
