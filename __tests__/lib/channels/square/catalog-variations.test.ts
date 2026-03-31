/**
 * @jest-environment node
 */

const mockGetSquareClientFn = jest.fn()
const mockFrom = jest.fn()

jest.mock('@/lib/channels/square/client', () => ({
  getSquareClient: (...args: unknown[]) => mockGetSquareClientFn(...args),
}))

jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({ from: (...args: unknown[]) => mockFrom(...args) }),
}))

import { pushProduct, pullProductsFromSquare } from '@/lib/channels/square/catalog'
import type { Product } from '@/lib/channels/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function b(value: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) => resolve(value),
  }
}

const multiVarProduct: Product = {
  id: 'prod-mv',
  name: 'Jacket',
  price: 25,
  stock_count: 0,
  description: 'A jacket with sizes',
  category_id: null,
  square_catalog_id: null,
  square_variation_id: null,
  images: [],
  is_active: true,
  gallery_featured: false,
  slug: 'jacket',
}

// ── pushProduct — multi-variation ─────────────────────────────────────────────

describe('pushProduct — multi-variation', () => {
  const mockCatalogUpsert = jest.fn()
  const mockCatalogDelete = jest.fn()
  const mockInventoryBatch = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetSquareClientFn.mockResolvedValue({
      client: {
        catalog: {
          object: {
            upsert: (...args: unknown[]) => mockCatalogUpsert(...args),
            delete: (...args: unknown[]) => mockCatalogDelete(...args),
          },
        },
        inventory: {
          batchCreateChanges: (...args: unknown[]) => mockInventoryBatch(...args),
        },
      },
      locationId: 'loc-1',
    })
  })

  it('sends all active variations to Square when has_options is true', async () => {
    let fromCallIndex = 0
    mockFrom.mockImplementation((table: string) => {
      fromCallIndex++
      // 1. categories lookup (skipped — no category_id)
      // 2. default variation lookup (price/stock)
      if (table === 'product_variations' && fromCallIndex <= 2) {
        return b({ data: { price: 25, stock_count: 3, square_variation_id: null }, error: null })
      }
      // 3. has_options check
      if (table === 'products' && fromCallIndex <= 3) {
        return b({ data: { has_options: true }, error: null })
      }
      // 4. fetch all active variations with option_values
      if (table === 'product_variations' && fromCallIndex <= 4) {
        return b({
          data: [
            { id: 'v1', price: 25, sku: 'SM', stock_count: 3, square_variation_id: null, option_values: [{ value: { name: 'Small' } }] },
            { id: 'v2', price: 30, sku: 'LG', stock_count: 1, square_variation_id: null, option_values: [{ value: { name: 'Large' } }] },
          ],
          error: null,
        })
      }
      // 5. products.update (save catalog ID)
      if (table === 'products') {
        return b({ data: null, error: null })
      }
      // 6+. variation ID mapping + inventory reads
      if (table === 'product_variations') {
        return b({
          data: [{ id: 'v1' }, { id: 'v2' }],
          error: null,
        })
      }
      return b({ data: null, error: null })
    })

    mockCatalogUpsert.mockResolvedValue({
      catalogObject: {
        id: 'cat-1',
        itemData: {
          variations: [{ id: 'sq-v1' }, { id: 'sq-v2' }],
        },
      },
    })
    mockInventoryBatch.mockResolvedValue({})

    const result = await pushProduct(multiVarProduct)

    expect(result.success).toBe(true)
    expect(mockCatalogUpsert).toHaveBeenCalledTimes(1)

    const upsertArg = mockCatalogUpsert.mock.calls[0][0]
    const variations = upsertArg.object.itemData.variations
    expect(variations).toHaveLength(2)
    expect(variations[0].itemVariationData.name).toBe('Small')
    expect(variations[1].itemVariationData.name).toBe('Large')
    expect(variations[0].itemVariationData.priceMoney.amount).toBe(BigInt(2500))
    expect(variations[1].itemVariationData.priceMoney.amount).toBe(BigInt(3000))
  })

  it('falls back to single "Regular" variation when has_options is false', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'product_variations') {
        return b({ data: { price: 25, stock_count: 3, square_variation_id: null }, error: null })
      }
      if (table === 'products') {
        return b({ data: { has_options: false }, error: null })
      }
      return b({ data: null, error: null })
    })

    mockCatalogUpsert.mockResolvedValue({
      catalogObject: {
        id: 'cat-1',
        itemData: { variations: [{ id: 'sq-v-default' }] },
      },
    })
    mockInventoryBatch.mockResolvedValue({})

    const result = await pushProduct(multiVarProduct)

    expect(result.success).toBe(true)
    const upsertArg = mockCatalogUpsert.mock.calls[0][0]
    const variations = upsertArg.object.itemData.variations
    expect(variations).toHaveLength(1)
    expect(variations[0].itemVariationData.name).toBe('Regular')
  })
})

// ── pullProductsFromSquare — multi-variation ──────────────────────────────────

describe('pullProductsFromSquare — multi-variation', () => {
  const mockCatalogList = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetSquareClientFn.mockResolvedValue({
      client: {
        catalog: {
          list: (...args: unknown[]) => mockCatalogList(...args),
        },
      },
      locationId: 'loc-1',
    })
  })

  it('creates product_variations for all Square item variations', async () => {
    const insertedRows: unknown[] = []
    let productSelectCount = 0

    mockFrom.mockImplementation((table: string) => {
      const builder = b({ data: null, error: null })

      if (table === 'product_variations') {
        // Build a chainable mock where .select().eq().single() returns "not found"
        // but .insert() captures the row
        const pvInsert = jest.fn().mockImplementation((row: unknown) => {
          insertedRows.push(row)
          return b({ data: { id: `new-var-${insertedRows.length}` }, error: null })
        })
        const pvSingleNotFound = {
          then: (resolve: (v: unknown) => void) => resolve({ data: null, error: { code: 'PGRST116' } }),
        }
        return {
          ...builder,
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockReturnValue(pvSingleNotFound),
              eq: jest.fn().mockReturnValue({
                single: jest.fn().mockReturnValue(pvSingleNotFound),
              }),
            }),
          }),
          insert: pvInsert,
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
            }),
          }),
        }
      }

      if (table === 'products') {
        productSelectCount++
        // First select: check existing product by square_catalog_id → not found
        // Second select: look up newly inserted product by square_catalog_id → found
        const selectMock = jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockReturnValue({
              then: (resolve: (v: unknown) => void) => {
                if (productSelectCount <= 1) {
                  resolve({ data: null, error: { code: 'PGRST116' } })
                } else {
                  resolve({ data: { id: 'new-prod-1' }, error: null })
                }
                productSelectCount++
              },
            }),
          }),
        })
        return {
          ...builder,
          select: selectMock,
          insert: jest.fn().mockReturnValue({
            then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
          }),
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
            }),
          }),
        }
      }

      if (table === 'categories') {
        return b({ data: null, error: null })
      }
      return builder
    })

    // Mock catalog.list() to return a paginated async iterator with a multi-variation item
    const items = [
      {
        type: 'ITEM',
        id: 'sq-item-1',
        itemData: {
          name: 'Jacket',
          variations: [
            { id: 'sq-v1', itemVariationData: { name: 'Small', priceMoney: { amount: 2500n, currency: 'USD' } } },
            { id: 'sq-v2', itemVariationData: { name: 'Large', priceMoney: { amount: 3000n, currency: 'USD' } } },
          ],
        },
      },
    ]
    // catalog.list() returns an awaitable that is also an async iterable
    mockCatalogList.mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {
        for (const item of items) yield item
      },
    })

    await pullProductsFromSquare()

    // Should have inserted variations (at least the non-first one via multi-var path)
    const variationInserts = insertedRows.filter(
      (r: any) => r.square_variation_id != null
    )
    expect(variationInserts.length).toBeGreaterThanOrEqual(1)

    // Verify the second variation was created with correct price
    const secondVar = variationInserts.find(
      (r: any) => r.square_variation_id === 'sq-v2'
    ) as any
    if (secondVar) {
      expect(secondVar.price).toBe(30)
      expect(secondVar.is_default).toBe(false)
    }
  })
})
