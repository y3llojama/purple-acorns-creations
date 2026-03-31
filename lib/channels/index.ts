import { createServiceRoleClient } from '@/lib/supabase/server'
import type { Product, SyncResult } from './types'

export async function getChannelConfig(): Promise<{
  squareEnabled: boolean
  pinterestEnabled: boolean
}> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('settings')
    .select('square_sync_enabled, pinterest_sync_enabled')
    .single()
  return {
    squareEnabled: data?.square_sync_enabled ?? false,
    pinterestEnabled: data?.pinterest_sync_enabled ?? false,
  }
}

/** Push a single product to all enabled channels. Fire-and-forget safe. */
export async function syncProduct(product: Product): Promise<SyncResult[]> {
  const config = await getChannelConfig()
  const results: SyncResult[] = []

  if (config.squareEnabled) {
    try {
      const { pushProduct } = await import('./square/catalog')
      results.push(await pushProduct(product))
    } catch (err) {
      results.push({ productId: product.id, channel: 'square', success: false, error: String(err) })
    }
  }

  if (config.pinterestEnabled) {
    try {
      const { pushProduct } = await import('./pinterest/catalog')
      results.push(await pushProduct(product))
    } catch (err) {
      results.push({ productId: product.id, channel: 'pinterest', success: false, error: String(err) })
    }
  }

  await logSyncResults(results)
  return results
}

export async function syncCategory(category: import('@/lib/supabase/types').Category): Promise<void> {
  const config = await getChannelConfig()
  if (!config.squareEnabled) return

  // Only sync leaf categories (no children) — structural check via parent_id
  const supabase = createServiceRoleClient()
  const { count } = await supabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', category.id)
  if ((count ?? 0) > 0) return

  try {
    const { pushCategory } = await import('./square/catalog')
    const result = await pushCategory(category)
    // Note: do NOT pass category.id to logSyncResults — channel_sync_log.product_id is a FK
    // to products. Log sync errors to console only for categories.
    if (!result.success) {
      console.error('syncCategory Square error:', result.error)
    }
  } catch (err) {
    console.error('syncCategory error:', err)
  }
}

/** Sync all active products to all enabled channels. */
export async function syncAllProducts(): Promise<SyncResult[]> {
  const supabase = createServiceRoleClient()
  const { data: products } = await supabase
    .from('products_with_default')
    .select('*')
    .eq('is_active', true)
  if (!products?.length) return []

  const allResults: SyncResult[] = []
  for (const product of products) {
    const results = await syncProduct(product as Product)
    allResults.push(...results)
  }
  return allResults
}

async function logSyncResults(results: SyncResult[]): Promise<void> {
  const supabase = createServiceRoleClient()
  for (const r of results) {
    await supabase.from('channel_sync_log').upsert({
      product_id: r.productId,
      channel: r.channel,
      status: r.success ? 'synced' : 'error',
      synced_at: r.success ? new Date().toISOString() : null,
      error: r.error ?? null,
    }, { onConflict: 'product_id,channel' })
  }
}
