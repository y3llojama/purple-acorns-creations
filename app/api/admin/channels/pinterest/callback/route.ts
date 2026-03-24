import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { encryptToken } from '@/lib/crypto'

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
    .find(([k]) => k === '__Host-pinterest_oauth_state')?.[1]

  if (!stateParam || !stateCookie || stateParam !== stateCookie) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?error=pinterest_csrf`
    )
  }

  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?error=pinterest_denied`
    )
  }

  const credentials = Buffer.from(
    `${process.env.PINTEREST_APP_ID}:${process.env.PINTEREST_APP_SECRET}`
  ).toString('base64')

  const tokenRes = await fetch('https://api.pinterest.com/v5/oauth/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/channels/pinterest/callback`,
    }),
  })

  if (!tokenRes.ok) {
    console.error('[pinterest/callback] token exchange failed:', tokenRes.status)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?error=pinterest_token`
    )
  }

  const tokens = await tokenRes.json()
  const supabase = createServiceRoleClient()
  const { data: row } = await supabase.from('settings').select('id').limit(1).maybeSingle()

  if (!row) {
    console.error('[pinterest/callback] no settings row found — tokens not stored')
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?error=pinterest_no_settings`
    )
  }

  const { error: dbError } = await supabase.from('settings').update({
    pinterest_access_token: encryptToken(tokens.access_token),
    pinterest_refresh_token: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
  }).eq('id', row.id)

  if (dbError) {
    console.error('[pinterest/callback] db update failed:', dbError.code)
  }

  const response = NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?connected=pinterest`
  )
  response.cookies.set('__Host-pinterest_oauth_state', '', { maxAge: 0, path: '/', secure: true })
  return response
}
