import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { encryptToken, decryptValue } from '@/lib/crypto'
import { SquareClient, SquareEnvironment } from 'square'

export async function GET(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const stateParam = searchParams.get('state')

  // Verify CSRF state
  const cookies = request.headers.get('cookie') ?? ''
  const stateCookie = cookies
    .split(';')
    .map(c => c.trim().split('=', 2))
    .find(([k]) => k === '__Host-square_oauth_state')?.[1]

  if (!stateParam || !stateCookie || stateParam !== stateCookie) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?error=square_csrf`
    )
  }

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?error=square_denied`
    )
  }

  const supabase = createServiceRoleClient()
  const { data: settings } = await supabase
    .from('settings')
    .select('id, square_application_id, square_application_secret, square_environment')
    .limit(1)
    .maybeSingle()

  const appId = settings?.square_application_id ?? process.env.SQUARE_APPLICATION_ID
  const rawSecret = settings?.square_application_secret
  const appSecret = rawSecret ? decryptValue(rawSecret) : (process.env.SQUARE_APPLICATION_SECRET ?? '')
  const environment = settings?.square_environment ?? process.env.SQUARE_ENVIRONMENT

  const baseUrl = environment === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com'

  const tokenRes = await fetch(`${baseUrl}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Square-Version': '2025-01-23' },
    body: JSON.stringify({
      client_id: appId,
      client_secret: appSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${(process.env.NEXT_PUBLIC_APP_URL ?? '').trim()}/api/admin/channels/square/callback`,
    }),
  })

  if (!tokenRes.ok) {
    const tokenErr = await tokenRes.json().catch(() => ({}))
    console.error('[square/callback] token exchange failed:', tokenRes.status, JSON.stringify(tokenErr))
    return NextResponse.redirect(
      `${(process.env.NEXT_PUBLIC_APP_URL ?? '').trim()}/admin/channels?error=square_token`
    )
  }

  const tokens = await tokenRes.json()

  const client = new SquareClient({
    token: tokens.access_token,
    environment: environment === 'production'
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox,
  })

  let locationId = ''
  try {
    const locResult = await client.locations.list()
    locationId = locResult.locations?.[0]?.id ?? ''
  } catch (e) {
    console.error('[square/callback] location fetch failed:', e)
    return NextResponse.redirect(
      `${(process.env.NEXT_PUBLIC_APP_URL ?? '').trim()}/admin/channels?error=square_location`
    )
  }

  // Settings table always has exactly one row — no .eq() filter needed
  const { error: dbError } = await supabase.from('settings').update({
    square_access_token: encryptToken(tokens.access_token),
    square_refresh_token: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
    square_token_expires_at: tokens.expires_at ?? null,
    square_location_id: locationId,
  })

  if (dbError) {
    console.error('[square/callback] db update failed:', dbError.code, dbError.message, dbError.details)
    const errMsg = encodeURIComponent(`${dbError.code}: ${dbError.message}`)
    const response = NextResponse.redirect(
      `${(process.env.NEXT_PUBLIC_APP_URL ?? '').trim()}/admin/channels?error=square_db&detail=${errMsg}`
    )
    response.cookies.set('__Host-square_oauth_state', '', { maxAge: 0, path: '/', secure: true })
    return response
  }

  const response = NextResponse.redirect(
    `${(process.env.NEXT_PUBLIC_APP_URL ?? '').trim()}/admin/channels?connected=square`
  )
  response.cookies.set('__Host-square_oauth_state', '', { maxAge: 0, path: '/', secure: true })
  return response
}
