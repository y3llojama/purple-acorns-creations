import { getSquareClient } from './client'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { Product, SyncResult } from '@/lib/channels/types'

const PRODUCT_CATEGORIES = ['rings', 'necklaces', 'earrings', 'bracelets', 'crochet', 'other'] as const
type ProductCategory = typeof PRODUCT_CATEGORIES[number]

/**
 * Ensures all product categories exist as Square CATEGORY objects.
 * IDs are cached in settings.square_category_ids so Square is only called
 * when a category is missing. Returns the full category → Square ID map.
 */
export async function ensureSquareCategories(): Promise<Record<string, string>> {
  const supabase = createServiceRoleClient()
  const { data: settings } = await supabase.from('settings').select('square_category_ids').single()
  const cached: Record<string, string> = (settings?.square_category_ids as Record<string, string>) ?? {}

  const missing = PRODUCT_CATEGORIES.filter(cat => !cached[cat])
  if (missing.length === 0) return cached

  const { client } = await getSquareClient()
  const result = await client.catalog.batchUpsert({
    idempotencyKey: `categories-${missing.join('-')}-${Date.now()}`,
    batches: [{
      objects: missing.map(cat => ({
        type: 'CATEGORY' as const,
        id: `#CAT-${cat}`,
        categoryData: { name: cat.charAt(0).toUpperCase() + cat.slice(1) },
      })),
    }],
  })

  const updated = { ...cached }
  for (const mapping of result.idMappings ?? []) {
    if (!mapping.clientObjectId || !mapping.objectId) continue
    const catName = mapping.clientObjectId.replace('#CAT-', '') as ProductCategory
    if (PRODUCT_CATEGORIES.includes(catName)) {
      updated[catName] = mapping.objectId
    }
  }

  await supabase.from('settings').update({ square_category_ids: updated })
  return updated
}

export async function pushProduct(product: Product): Promise<SyncResult> {
  try {
    const { client, locationId } = await getSquareClient()
    const idempotencyKey = `product-${product.id}-${Date.now()}`

    const categoryMap = await ensureSquareCategories()
    const squareCategoryId = categoryMap[product.category]

    // If the product already exists in Square, delete it first.
    // Upserting an existing object requires the current version from Square's DB,
    // and that version can diverge in ways that are hard to track locally.
    // Delete-then-recreate avoids version management entirely and is safe for this use case.
    if (product.square_catalog_id) {
      await client.catalog.object.delete({ objectId: product.square_catalog_id }).catch(() => {
        // Object may have already been deleted from Square — safe to continue.
      })
    }

    const result = await client.catalog.object.upsert({
      idempotencyKey,
      object: {
        type: 'ITEM',
        id: `#NEW-${product.id}`,
        itemData: {
          name: product.name,
          description: product.description ?? undefined,
          categories: squareCategoryId ? [{ id: squareCategoryId }] : undefined,
          variations: [{
            type: 'ITEM_VARIATION',
            id: `#VAR-${product.id}`,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const variationId = (result.catalogObject as any)?.itemData?.variations?.[0]?.id
    if (!catalogObjectId) throw new Error('Square upsert returned no catalog object ID')

    const supabase = createServiceRoleClient()
    await supabase.from('products').update({
      square_catalog_id: catalogObjectId,
      square_variation_id: variationId ?? null,
    }).eq('id', product.id)

    if (variationId) {
      await client.inventory.batchCreateChanges({
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
  // Ensure categories exist once before syncing all products in parallel.
  await ensureSquareCategories()
  return Promise.all(products.map(pushProduct))
}
