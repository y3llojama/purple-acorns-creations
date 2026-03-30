import { SquareClient, SquareEnvironment } from 'square'
import { decryptToken, encryptToken, decryptValue } from '@/lib/crypto'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { shouldLog, buildLogEntry, writeLogEntry } from './logger'

export async function getSquareClient(): Promise<{ client: SquareClient; locationId: string }> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('settings')
    .select('id, square_access_token, square_refresh_token, square_token_expires_at, square_location_id, square_application_id, square_application_secret, square_environment, square_log_level, square_log_expires_at')
    .single()

  if (!data?.square_access_token) throw new Error('Square not connected')

  const environment = data.square_environment ?? process.env.SQUARE_ENVIRONMENT
  const isProd = environment === 'production'
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
          }).eq('id', data.id)
        } else {
          console.error('[square/client] token refresh failed — using existing token:', refreshRes.status)
        }
      } catch (err) {
        console.error('[square/client] token refresh error — using existing token:', err)
      }
    }
  }

  // Determine log level from settings (already fetched)
  const logLevel = data.square_log_level ?? 'none'
  const logActive = shouldLog(logLevel, data.square_log_expires_at)

  // Build a logging fetch wrapper using the SDK's `fetch` option (native fetch signature)
  const loggingFetch: typeof globalThis.fetch | undefined = logActive
    ? async (input, init) => {
        const start = Date.now()
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url
        const method = init?.method ?? 'GET'
        const path = url.replace(/^https:\/\/connect\.(squareup|squareupsandbox)\.com/, '')

        let requestBody: unknown = null
        if (logLevel === 'full' && init?.body) {
          try { requestBody = JSON.parse(String(init.body)) } catch { requestBody = null }
        }

        const response = await globalThis.fetch(input, init)
        const duration = Date.now() - start

        let responseBody: unknown = null
        const responseClone = response.clone()
        try {
          responseBody = await responseClone.json()
        } catch {
          responseBody = null
        }

        const entry = buildLogEntry(logLevel, method, path, response.status, duration, requestBody, responseBody)
        writeLogEntry(entry) // fire-and-forget

        return response
      }
    : undefined

  const client = new SquareClient({
    token: accessToken,
    environment: isProd ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
    ...(loggingFetch ? { fetch: loggingFetch } : {}),
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
