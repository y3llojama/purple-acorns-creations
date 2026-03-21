import { SquareClient, SquareEnvironment } from 'square'
import { decryptToken } from '@/lib/crypto'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function getSquareClient(): Promise<{ client: SquareClient; locationId: string }> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('settings')
    .select('id, square_access_token, square_location_id')
    .single()

  if (!data?.square_access_token) throw new Error('Square not connected')

  const accessToken = decryptToken(data.square_access_token)
  const client = new SquareClient({
    token: accessToken,
    environment: process.env.SQUARE_ENVIRONMENT === 'production'
      ? SquareEnvironment.Production
      : SquareEnvironment.Sandbox,
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
