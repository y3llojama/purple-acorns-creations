import { decryptToken } from '@/lib/crypto'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function getPinterestHeaders(): Promise<{ headers: HeadersInit; catalogId: string | null }> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('settings')
    .select('pinterest_access_token, pinterest_catalog_id')
    .single()
  if (!data?.pinterest_access_token) throw new Error('Pinterest not connected')
  return {
    headers: {
      Authorization: `Bearer ${decryptToken(data.pinterest_access_token)}`,
      'Content-Type': 'application/json',
    },
    catalogId: data.pinterest_catalog_id,
  }
}
