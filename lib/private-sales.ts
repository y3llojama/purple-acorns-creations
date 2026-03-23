import type { SupabaseClient } from '@supabase/supabase-js'

export async function releaseExpiredSales(supabase: SupabaseClient) {
  const { data: expired, error: fetchError } = await supabase
    .from('private_sales')
    .select('id')
    .lt('expires_at', new Date().toISOString())
    .is('used_at', null)
    .is('revoked_at', null)
    .limit(50)

  if (fetchError) {
    console.error('[releaseExpiredSales] fetch error:', fetchError.message)
    return
  }
  if (!expired?.length) return

  const results = await Promise.all(
    expired.map(s => supabase.rpc('release_private_sale_stock', { sale_id: s.id }))
  )
  results.forEach((r, i) => {
    if (r.error) console.error(`[releaseExpiredSales] failed for sale ${expired[i].id}:`, r.error.message)
  })
}
