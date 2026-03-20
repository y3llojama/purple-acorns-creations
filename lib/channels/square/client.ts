import { Client, Environment } from 'square'
import { decryptToken } from '@/lib/crypto'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function getSquareClient(): Promise<{ client: Client; locationId: string }> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('settings')
    .select('square_access_token, square_location_id')
    .single()

  if (!data?.square_access_token) throw new Error('Square not connected')

  const accessToken = decryptToken(data.square_access_token)
  const client = new Client({
    accessToken,
    environment: process.env.SQUARE_ENVIRONMENT === 'production'
      ? Environment.Production
      : Environment.Sandbox,
  })
  return { client, locationId: data.square_location_id ?? '' }
}
