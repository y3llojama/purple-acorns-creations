import { getSquareClient } from './client'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { Product, SyncResult } from '@/lib/channels/types'

export async function pushProduct(product: Product): Promise<SyncResult> {
  try {
    const { client, locationId } = await getSquareClient()
    const idempotencyKey = `product-${product.id}-${Date.now()}`

    const { result } = await client.catalogApi.upsertCatalogObject({
      idempotencyKey,
      object: {
        type: 'ITEM',
        id: product.square_catalog_id ?? `#NEW-${product.id}`,
        itemData: {
          name: product.name,
          description: product.description ?? undefined,
          variations: [{
            type: 'ITEM_VARIATION',
            id: product.square_variation_id ?? `#VAR-${product.id}`,
            itemVariationData: {
              name: 'Regular',
              pricingType: 'FIXED_PRICING',
              priceMoney: {
                amount: BigInt(Math.round(product.price * 100)),
                currency: 'USD',
              },
              locationOverrides: [{ locationId, trackInventory: true }],
            },
          }],
        },
      },
    })

    const catalogObjectId = result.catalogObject?.id
    const variationId = result.catalogObject?.itemData?.variations?.[0]?.id
    if (!catalogObjectId) throw new Error('Square upsert returned no catalog object ID')

    const supabase = createServiceRoleClient()
    await supabase.from('products').update({
      square_catalog_id: catalogObjectId,
      square_variation_id: variationId ?? null,
    }).eq('id', product.id)

    if (variationId) {
      await client.inventoryApi.batchChangeInventory({
        idempotencyKey: `inv-${product.id}-${Date.now()}`,
        changes: [{
          type: 'PHYSICAL_COUNT',
          physicalCount: {
            catalogObjectId: variationId,
            locationId,
            quantity: String(product.stock_count),
            occurredAt: new Date().toISOString(),
            state: 'IN_STOCK',
          },
        }],
      })
    }

    return { productId: product.id, channel: 'square', success: true }
  } catch (err) {
    return { productId: product.id, channel: 'square', success: false, error: String(err) }
  }
}

export async function fullSync(products: Product[]): Promise<SyncResult[]> {
  return Promise.all(products.map(pushProduct))
}
