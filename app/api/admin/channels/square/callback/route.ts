import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { encryptToken } from '@/lib/crypto'
import { Client, Environment } from 'square'

export async function GET(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error

  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  if (!code) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?error=square_denied`)
  }

  const baseUrl = process.env.SQUARE_ENVIRONMENT === 'production'
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com'

  const tokenRes = await fetch(`${baseUrl}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Square-Version': '2024-01-18' },
    body: JSON.stringify({
      client_id: process.env.SQUARE_APPLICATION_ID,
      client_secret: process.env.SQUARE_APPLICATION_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/channels/square/callback`,
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?error=square_token`)
  }

  const tokens = await tokenRes.json()

  const client = new Client({
    accessToken: tokens.access_token,
    environment: process.env.SQUARE_ENVIRONMENT === 'production'
      ? Environment.Production
      : Environment.Sandbox,
  })

  let locationId = ''
  try {
    const { result: locResult } = await client.locationsApi.listLocations()
    locationId = locResult.locations?.[0]?.id ?? ''
  } catch {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?error=square_location`)
  }

  const supabase = createServiceRoleClient()
  await supabase.from('settings').update({
    square_access_token: encryptToken(tokens.access_token),
    square_refresh_token: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
    square_location_id: locationId,
  })

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?connected=square`)
}
