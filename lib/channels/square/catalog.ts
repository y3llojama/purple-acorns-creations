import crypto from 'crypto'
import { getSquareClient } from './client'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { sanitizeText, sanitizeContent } from '@/lib/sanitize'
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
      idempotencyKey: `category-${category.id}-${crypto.randomUUID()}`,
      object: {
        type: 'CATEGORY',
        id: `#CAT-${category.id}`,
        categoryData: {
          name: category.name,
          categoryType: 'REGULAR_CATEGORY',
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
    const idempotencyKey = `product-${product.id}-${crypto.randomUUID()}`

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

    // Read price/stock from the default variation (single stock authority)
    const { data: defaultVar } = await supabase
      .from('product_variations')
      .select('price,stock_count,square_variation_id')
      .eq('product_id', product.id)
      .eq('is_default', true)
      .single()

    const variationPrice = defaultVar?.price ?? product.price
    const variationStock = defaultVar?.stock_count ?? product.stock_count

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
                amount: BigInt(Math.round(variationPrice * 100)),
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

    if (variationId && defaultVar) {
      await supabase
        .from('product_variations')
        .update({ square_variation_id: variationId })
        .eq('product_id', product.id)
        .eq('is_default', true)
    }

    if (variationId) {
      await client.inventory.batchCreateChanges({
        idempotencyKey: `inv-${product.id}-${crypto.randomUUID()}`,
        changes: [{
          type: 'PHYSICAL_COUNT',
          physicalCount: {
            catalogObjectId: variationId,
            locationId,
            quantity: String(variationStock),
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

// ─── Inventory pull (Square → Supabase) ────────────────────────────────────

export async function pullInventoryFromSquare(): Promise<{ updated: number; skipped: number; errors: string[] }> {
  const { client, locationId } = await getSquareClient()
  const supabase = createServiceRoleClient()

  // Fetch all variations that have a Square variation ID
  const { data: variations, error: fetchError } = await supabase
    .from('product_variations')
    .select('id, square_variation_id, stock_count')
  if (fetchError) throw new Error(`Failed to fetch variations: ${fetchError.message}`)

  const linked = (variations ?? []).filter(v => v.square_variation_id)
  if (linked.length === 0) return { updated: 0, skipped: 0, errors: [] }

  const catalogObjectIds = linked.map(v => v.square_variation_id as string)

  const countsResult = await client.inventory.batchGetCounts({
    catalogObjectIds,
    locationIds: [locationId],
  })

  const counts = countsResult.data ?? []

  let updated = 0
  let skipped = 0
  const errors: string[] = []

  for (const variation of linked) {
    const count = counts.find(
      c => c.catalogObjectId === variation.square_variation_id && c.state === 'IN_STOCK'
    )
    if (!count) { skipped++; continue }

    const newQty = Math.max(0, parseInt(count.quantity ?? '0', 10))
    if (newQty === variation.stock_count) { skipped++; continue }

    const { error: updateError } = await supabase
      .from('product_variations')
      .update({ stock_count: newQty, updated_at: new Date().toISOString() })
      .eq('id', variation.id)

    if (updateError) {
      errors.push(`Variation ${variation.id}: ${updateError.message}`)
    } else {
      updated++
      // Write stock movement for audit trail (non-blocking)
      const delta = newQty - variation.stock_count
      try {
        await supabase.from('stock_movements').insert({
          variation_id: variation.id,
          quantity_change: delta,
          reason: 'sync_correction',
          source: 'square',
        })
      } catch {
        // Audit trail failure should not block sync
      }
    }
  }

  return { updated, skipped, errors }
}

// ─── Inventory push (Supabase → Square) ─────────────────────────────────────

/**
 * Push a sold quantity to Square as an ADJUSTMENT (IN_STOCK → SOLD).
 * Call this after a successful checkout to keep Square counts in sync.
 */
export async function pushInventoryToSquare(
  items: Array<{ squareVariationId: string; quantity: number }>
): Promise<void> {
  if (items.length === 0) return

  const { client, locationId } = await getSquareClient()
  const occurredAt = new Date().toISOString()

  await client.inventory.batchCreateChanges({
    idempotencyKey: `checkout-push-${crypto.randomUUID()}`,
    changes: items.map(item => ({
      type: 'ADJUSTMENT' as const,
      adjustment: {
        catalogObjectId: item.squareVariationId,
        quantity: String(item.quantity),
        occurredAt,
        fromState: 'IN_STOCK' as const,
        toState: 'SOLD' as const,
        locationId,
      },
    })),
  })
}

// ─── Categories pull (Square → Supabase) ─────────────────────────────────────

/**
 * Pull categories from the Square catalog and upsert them into Supabase.
 * Matches on `square_category_id`. Creates new rows for unknown Square categories.
 * Returns { upserted, errors }.
 */
export async function pullCategoriesFromSquare(): Promise<{ upserted: number; errors: string[] }> {
  const { client } = await getSquareClient()
  const supabase = createServiceRoleClient()

  // Paginate all CATEGORY objects — await the Page, then iterate across pages
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const objects: any[] = []
  const catPage = await client.catalog.list({ types: 'CATEGORY' })
  for await (const obj of catPage) {
    objects.push(obj)
  }

  let upserted = 0
  const errors: string[] = []

  for (const obj of objects) {
    if (obj.type !== 'CATEGORY' || !obj.id) continue
    const catData = obj.categoryData
    if (!catData?.name) continue

    const squareCategoryId = obj.id
    const name = sanitizeText(catData.name.trim())
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

    // Check if we already have this category
    const { data: existing } = await supabase
      .from('categories')
      .select('id')
      .eq('square_category_id', squareCategoryId)
      .single()

    if (existing) {
      // Update name and slug if changed
      const { error: updateError } = await supabase
        .from('categories')
        .update({ name, slug, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
      if (updateError) {
        errors.push(`Category ${squareCategoryId}: ${updateError.message}`)
      } else {
        upserted++
      }
    } else {
      // Insert new category
      const { error: insertError } = await supabase
        .from('categories')
        .insert({
          name,
          slug,
          square_category_id: squareCategoryId,
          parent_id: null,
          sort_order: 0,
          online_visibility: catData.onlineVisibility ?? true,
        })
      if (insertError) {
        // Slug collision — skip gracefully
        if (!insertError.message.includes('duplicate') && !insertError.message.includes('unique')) {
          errors.push(`Category ${squareCategoryId}: ${insertError.message}`)
        }
      } else {
        upserted++
      }
    }
  }

  return { upserted, errors }
}

// ─── Products pull (Square → Supabase) ───────────────────────────────────────

/**
 * Pull ITEM objects from the Square catalog and upsert them into Supabase products.
 * Matches on `square_catalog_id`. Creates new rows for unknown Square items.
 * Returns { upserted, errors }.
 */
export async function pullProductsFromSquare(): Promise<{ upserted: number; errors: string[] }> {
  const { client } = await getSquareClient()
  const supabase = createServiceRoleClient()

  // Paginate all ITEM objects — await the Page, then iterate across pages
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const objects: any[] = []
  const itemPage = await client.catalog.list({ types: 'ITEM' })
  for await (const obj of itemPage) {
    objects.push(obj)
  }

  let upserted = 0
  const errors: string[] = []

  for (const obj of objects) {
    if (obj.type !== 'ITEM' || !obj.id) continue
    const itemData = obj.itemData
    if (!itemData?.name) continue

    const squareCatalogId = obj.id
    const name = sanitizeText(itemData.name.trim())
    const description = itemData.description ? sanitizeContent(itemData.description) : null

    // Price from first variation (cents BigInt → dollars float)
    // variations[] is CatalogObject[] — cast to access itemVariationData
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const variation = itemData.variations?.[0] as any
    const variationId: string | null = variation?.id ?? null
    const priceCents = variation?.itemVariationData?.priceMoney?.amount
    const price = priceCents != null ? Number(priceCents) / 100 : 0

    // Category link via Square category ID
    let categoryId: string | null = null
    const squareCategoryId = itemData.categories?.[0]?.id
    if (squareCategoryId) {
      const { data: cat } = await supabase
        .from('categories')
        .select('id')
        .eq('square_category_id', squareCategoryId)
        .single()
      categoryId = cat?.id ?? null
    }

    const { data: existing } = await supabase
      .from('products')
      .select('id')
      .eq('square_catalog_id', squareCatalogId)
      .single()

    if (existing) {
      const { error: updateError } = await supabase
        .from('products')
        .update({
          name,
          description,
          price,
          category_id: categoryId,
          square_variation_id: variationId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      if (updateError) {
        errors.push(`Product ${squareCatalogId}: ${updateError.message}`)
      } else {
        upserted++
        // Upsert default variation (best-effort — don't block pull on variation failures)
        if (variationId) {
          try {
            const { data: existingVar } = await supabase
              .from('product_variations')
              .select('id')
              .eq('product_id', existing.id)
              .eq('is_default', true)
              .single()

            if (existingVar) {
              await supabase.from('product_variations')
                .update({ price, square_variation_id: variationId, updated_at: new Date().toISOString() })
                .eq('id', existingVar.id)
            } else {
              await supabase.from('product_variations').insert({
                product_id: existing.id, price, square_variation_id: variationId,
                is_default: true, is_active: true, stock_count: 0,
              })
            }
          } catch {
            // Variation upsert failure should not block product sync
          }
        }
      }
    } else {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const { error: insertError } = await supabase
        .from('products')
        .insert({
          name,
          description,
          price,
          category_id: categoryId,
          stock_count: 0,
          images: [],
          is_active: true,
          gallery_featured: false,
          square_catalog_id: squareCatalogId,
          square_variation_id: variationId,
          slug,
        })
      if (insertError) {
        if (!insertError.message.includes('duplicate') && !insertError.message.includes('unique')) {
          errors.push(`Product ${squareCatalogId}: ${insertError.message}`)
        }
      } else {
        upserted++
        // Create default variation for new product (best-effort)
        try {
          const { data: newProduct } = await supabase
            .from('products').select('id').eq('square_catalog_id', squareCatalogId).single()
          if (newProduct) {
            await supabase.from('product_variations').insert({
              product_id: newProduct.id, price, square_variation_id: variationId,
              is_default: true, is_active: true, stock_count: 0,
            })
          }
        } catch {
          // Variation creation failure should not block product sync
        }
      }
    }
  }

  return { upserted, errors }
}
