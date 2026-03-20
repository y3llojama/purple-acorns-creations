import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'

export async function GET(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const appId = process.env.SQUARE_APPLICATION_ID
  if (!appId) return NextResponse.json({ error: 'Square not configured' }, { status: 500 })

  const baseUrl = process.env.SQUARE_ENVIRONMENT === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com'

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/channels/square/callback`
  const scope = [
    'MERCHANT_PROFILE_READ', 'ITEMS_READ', 'ITEMS_WRITE',
    'INVENTORY_READ', 'INVENTORY_WRITE',
    'ORDERS_READ', 'ORDERS_WRITE',
    'PAYMENTS_READ', 'PAYMENTS_WRITE',
  ].join(' ')

  const url = new URL(`${baseUrl}/oauth2/authorize`)
  url.searchParams.set('client_id', appId)
  url.searchParams.set('scope', scope)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('session', 'false')

  return NextResponse.redirect(url.toString())
}
