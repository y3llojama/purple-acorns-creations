import { SquareClient, SquareEnvironment } from 'square'
import { decryptToken, encryptToken, decryptValue } from '@/lib/crypto'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function getSquareClient(): Promise<{ client: SquareClient; locationId: string }> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('settings')
    .select('id, square_access_token, square_refresh_token, square_token_expires_at, square_location_id, square_application_id, square_application_secret, square_environment')
    .single()

  if (!data?.square_access_token) throw new Error('Square not connected')

  const environment = data.square_environment ?? process.env.SQUARE_ENVIRONMENT
  const isProd = environment === 'production'
  // DEBUG: remove after production cutover
  const debugToken = decryptToken(data.square_access_token)
  console.log('[square/client] env:', environment, 'isProd:', isProd, 'tokenStarts:', debugToken.substring(0, 10))
  const baseUrl = isProd ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com'

  // Refresh the access token if it expires within the next 24 hours
  let accessToken = decryptToken(data.square_access_token)
  if (data.square_token_expires_at && data.square_refresh_token) {
    const expiresAt = new Date(data.square_token_expires_at)
    const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    if (expiresAt <= oneDayFromNow) {
      try {
        const appId = data.square_application_id ?? process.env.SQUARE_APPLICATION_ID
        const appSecret = data.square_application_secret
          ? decryptValue(data.square_application_secret)
          : (process.env.SQUARE_APPLICATION_SECRET ?? '')
        const refreshToken = decryptToken(data.square_refresh_token)

        const refreshRes = await fetch(`${baseUrl}/oauth2/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Square-Version': '2025-01-23' },
          body: JSON.stringify({
            client_id: appId,
            client_secret: appSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          }),
        })

        if (refreshRes.ok) {
          const tokens = await refreshRes.json()
          accessToken = tokens.access_token
          await supabase.from('settings').update({
            square_access_token: encryptToken(tokens.access_token),
            square_refresh_token: tokens.refresh_token ? encryptToken(tokens.refresh_token) : data.square_refresh_token,
            square_token_expires_at: tokens.expires_at ?? null,
          })
        } else {
          console.error('[square/client] token refresh failed — using existing token:', refreshRes.status)
        }
      } catch (err) {
        console.error('[square/client] token refresh error — using existing token:', err)
      }
    }
  }

  const client = new SquareClient({
    token: accessToken,
    environment: isProd ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
  })

  // Auto-discover and persist location ID if missing
  let locationId = data.square_location_id ?? ''
  if (!locationId) {
    const locResult = await client.locations.list()
    locationId = locResult.locations?.[0]?.id ?? ''
    if (locationId) {
      await supabase.from('settings').update({ square_location_id: locationId }).eq('id', data.id)
    }
  }

  return { client, locationId }
}
