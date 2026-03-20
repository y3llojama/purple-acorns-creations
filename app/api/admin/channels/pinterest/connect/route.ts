import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'

export async function GET() {
  const { error } = await requireAdminSession()
  if (error) return error
  const appId = process.env.PINTEREST_APP_ID
  if (!appId) return NextResponse.json({ error: 'Pinterest not configured' }, { status: 500 })
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/admin/channels/pinterest/callback`
  const url = new URL('https://www.pinterest.com/oauth/')
  url.searchParams.set('client_id', appId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'ads:read,catalogs:read,catalogs:write')
  return NextResponse.redirect(url.toString())
}
