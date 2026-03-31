import { createHmac, timingSafeEqual } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/server'

export function verifySquareSignature(
  url: string,
  rawBody: string,
  signatureHeader: string,
  webhookKey: string,
): boolean {
  const expected = createHmac('sha256', webhookKey).update(url + rawBody).digest('base64')
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader))
  } catch {
    return false
  }
}

export async function handleInventoryUpdate(payload: unknown): Promise<void> {
  const p = payload as {
    data?: { object?: { inventory_counts?: Array<{ catalog_object_id: string; quantity: string }> } }
  }
  const counts = p?.data?.object?.inventory_counts ?? []
  const supabase = createServiceRoleClient()
  for (const count of counts) {
    const qty = parseInt(count.quantity, 10)
    if (!Number.isFinite(qty) || qty < 0) {
      console.warn('[square-webhook] invalid inventory quantity, skipping:', count.quantity)
      continue
    }

    // Read current stock to calculate delta
    const { data: variation } = await supabase
      .from('product_variations')
      .select('id,stock_count')
      .eq('square_variation_id', count.catalog_object_id)
      .maybeSingle()

    if (!variation) {
      console.warn('[square-webhook] no variation found for', count.catalog_object_id)
      continue
    }

    const { error } = await supabase
      .from('product_variations')
      .update({ stock_count: qty, updated_at: new Date().toISOString() })
      .eq('id', variation.id)

    if (error) {
      console.error('[square-webhook] failed to update stock for', count.catalog_object_id, error.message)
      continue
    }

    // Write stock movement for audit trail
    const delta = qty - variation.stock_count
    if (delta !== 0) {
      await supabase.from('stock_movements').insert({
        variation_id: variation.id,
        quantity_change: delta,
        reason: 'sync_correction',
        source: 'square',
      })
    }
  }
}

export async function handleCatalogConflict(payload: unknown): Promise<void> {
  const p = payload as { data?: { ids?: string[] } }
  const ids = p?.data?.ids ?? []
  if (!ids.length) return
  const supabase = createServiceRoleClient()
  for (const squareCatalogId of ids) {
    const { data: product } = await supabase
      .from('products').select('id').eq('square_catalog_id', squareCatalogId).single()
    if (!product) continue
    await supabase.from('channel_sync_log').upsert({
      product_id: product.id,
      channel: 'square',
      status: 'conflict',
      error: 'catalog.version.updated received — review and re-sync',
    }, { onConflict: 'product_id,channel' })
  }
}
