import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { encryptToken } from '@/lib/crypto'

export async function GET(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  if (!code) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?error=pinterest_denied`)

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

  if (!tokenRes.ok) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?error=pinterest_token`)

  const tokens = await tokenRes.json()
  const supabase = createServiceRoleClient()
  await supabase.from('settings').update({
    pinterest_access_token: encryptToken(tokens.access_token),
    pinterest_refresh_token: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
  })
  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/admin/channels?connected=pinterest`)
}
