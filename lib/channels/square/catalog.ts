import { getSquareClient } from './client'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { Product, SyncResult } from '@/lib/channels/types'
import type { Category } from '@/lib/supabase/types'

// ─── Category sync ─────────────────────────────────────────────────────────

export async function pushCategory(category: Category): Promise<SyncResult> {
  try {
    const { client } = await getSquareClient()
    const supabase = createServiceRoleClient()

    // Delete-then-recreate to avoid VERSION_MISMATCH
    if (category.square_category_id) {
      await deleteSquareCategory(category.square_category_id)
    }

    // Look up parent's Square ID if this is a sub-category
    let parentSquareCategoryId: string | undefined
    if (category.parent_id) {
      const { data: parent } = await supabase
        .from('categories')
        .select('square_category_id')
        .eq('id', category.parent_id)
        .single()
      parentSquareCategoryId = parent?.square_category_id ?? undefined
    }

    const result = await client.catalog.object.upsert({
      idempotencyKey: `category-${category.id}-${Date.now()}`,
      object: {
        type: 'CATEGORY',
        id: `#CAT-${category.id}`,
        categoryData: {
          name: category.name,
          categoryType: category.category_type as 'REGULAR_CATEGORY' | 'MENU_CATEGORY',
          onlineVisibility: category.online_visibility,
          parentCategory: parentSquareCategoryId ? { id: parentSquareCategoryId } : undefined,
          ecomSeoData: (category.seo_title || category.seo_description || category.seo_permalink) ? {
            pageTitle: category.seo_title ?? undefined,
            pageDescription: category.seo_description ?? undefined,
            permalink: category.seo_permalink ?? undefined,
          } : undefined,
        },
      },
    })

    const squareCategoryId = result.catalogObject?.id
    if (!squareCategoryId) throw new Error('Square upsert returned no catalog object ID')

    const { error: updateError } = await supabase
      .from('categories')
      .update({ square_category_id: squareCategoryId, updated_at: new Date().toISOString() })
      .eq('id', category.id)
    if (updateError) throw new Error(`Failed to update category square_category_id: ${updateError.message}`)

    return { productId: category.id, channel: 'square', success: true }
  } catch (err) {
    return { productId: category.id, channel: 'square', success: false, error: String(err) }
  }
}

export async function deleteSquareCategory(squareCategoryId: string): Promise<void> {
  try {
    const { client } = await getSquareClient()
    await client.catalog.object.delete({ objectId: squareCategoryId })
  } catch (err) {
    // 404 = already deleted — safe to ignore
    if (!String(err).includes('404')) {
      console.error('Square category delete failed:', err)
    }
  }
}

// ─── Product sync ─────────────────────────────────────────────────────────────

export async function pushProduct(product: Product): Promise<SyncResult> {
  try {
    const { client, locationId } = await getSquareClient()
    const supabase = createServiceRoleClient()
    const idempotencyKey = `product-${product.id}-${Date.now()}`

    // Look up the category's Square ID via the FK
    let squareCategoryId: string | undefined
    if (product.category_id) {
      const { data } = await supabase
        .from('categories')
        .select('square_category_id')
        .eq('id', product.category_id)
        .single()
      if (data?.square_category_id) {
        squareCategoryId = data.square_category_id
      }
      // If category exists but has no square_category_id, sync proceeds without category link
    }

    // Delete-then-recreate to avoid VERSION_MISMATCH
    if (product.square_catalog_id) {
      try {
        await client.catalog.object.delete({ objectId: product.square_catalog_id })
      } catch (err) {
        if (!String(err).includes('404')) {
          console.error('Square product delete failed:', err)
        }
      }
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

    const { error: updateError } = await supabase
      .from('products')
      .update({ square_catalog_id: catalogObjectId, square_variation_id: variationId ?? null })
      .eq('id', product.id)
    if (updateError) throw new Error(`Failed to update product square_catalog_id: ${updateError.message}`)

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
  return Promise.all(products.map(pushProduct))
}
