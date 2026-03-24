import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import crypto from 'crypto'

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error

  const appId = process.env.PINTEREST_APP_ID
  if (!appId) return NextResponse.json({ error: 'Pinterest not configured' }, { status: 500 })

  const state = crypto.randomUUID()
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/channels/pinterest/callback`
  const url = new URL('https://www.pinterest.com/oauth/')
  url.searchParams.set('client_id', appId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'ads:read,catalogs:read,catalogs:write')
  url.searchParams.set('state', state)

  const response = NextResponse.redirect(url.toString())
  response.cookies.set('__Host-pinterest_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  return response
}
