import type { SupabaseClient } from '@supabase/supabase-js'

export async function releaseExpiredSales(supabase: SupabaseClient) {
  const { data: expired } = await supabase
    .from('private_sales')
    .select('id')
    .lt('expires_at', new Date().toISOString())
    .is('used_at', null)
    .is('revoked_at', null)
    .limit(50)

  if (!expired?.length) return
  await Promise.all(expired.map(s => supabase.rpc('release_private_sale_stock', { sale_id: s.id })))
}
