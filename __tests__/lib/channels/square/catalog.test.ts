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

import {
  pushProduct,
  pushCategory,
  deleteSquareCategory,
  pullInventoryFromSquare,
  pushInventoryToSquare,
  pullCategoriesFromSquare,
  pullProductsFromSquare,
  fullSync,
} from '@/lib/channels/square/catalog'
import type { Product } from '@/lib/channels/types'
import type { Category } from '@/lib/supabase/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

// A thenable query builder — all chain methods return `this`, await resolves to `value`.
function b(value: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) => resolve(value),
  }
}

const product: Product = {
  id: 'prod-1',
  name: 'Ring',
  price: 45,
  stock_count: 3,
  description: 'A ring',
  category_id: 'cat-1',
  square_catalog_id: null,
  square_variation_id: null,
  images: [],
  is_active: true,
  gallery_featured: false,
  slug: 'ring',
}

const category: Category = {
  id: 'cat-1',
  name: 'Rings',
  slug: 'rings',
  parent_id: null,
  sort_order: 0,
  category_type: 'REGULAR_CATEGORY',
  online_visibility: true,
  square_category_id: null,
  seo_title: null,
  seo_description: null,
  seo_permalink: null,
  created_at: '',
  updated_at: '',
}


// Helper: wrap an array so `for await (const x of ...)` works in tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asyncIter(items: any[]) {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [Symbol.asyncIterator]: async function* (): AsyncGenerator<any> {
      for (const item of items) yield item
    },
  }
}

beforeEach(() => jest.resetAllMocks())

// ── pushInventoryToSquare ─────────────────────────────────────────────────────

describe('pushInventoryToSquare', () => {
  it('returns immediately when items array is empty', async () => {
    await pushInventoryToSquare([])
    expect(mockGetSquareClientFn).not.toHaveBeenCalled()
  })

  it('calls batchCreateChanges with ADJUSTMENT type for each item', async () => {
    const mockBatch = jest.fn().mockResolvedValue({})
    mockGetSquareClientFn.mockResolvedValue({
      client: { inventory: { batchCreateChanges: mockBatch } },
      locationId: 'loc1',
    })

    await pushInventoryToSquare([{ squareVariationId: 'var1', quantity: 2 }])

    expect(mockBatch).toHaveBeenCalledTimes(1)
    const call = mockBatch.mock.calls[0][0]
    expect(call.changes).toHaveLength(1)
    expect(call.changes[0].type).toBe('ADJUSTMENT')
    expect(call.changes[0].adjustment.catalogObjectId).toBe('var1')
    expect(call.changes[0].adjustment.quantity).toBe('2')
    expect(call.changes[0].adjustment.fromState).toBe('IN_STOCK')
    expect(call.changes[0].adjustment.toState).toBe('SOLD')
  })
})

// ── pullInventoryFromSquare ───────────────────────────────────────────────────

describe('pullInventoryFromSquare', () => {
  it('returns zeros when no products have a Square variation ID', async () => {
    mockGetSquareClientFn.mockResolvedValue({ client: {}, locationId: 'loc1' })
    mockFrom.mockReturnValue(b({ data: [{ id: 'p1', square_variation_id: null, stock_count: 5 }], error: null }))

    const result = await pullInventoryFromSquare()
    expect(result).toEqual({ updated: 0, skipped: 0, errors: [] })
  })

  it('updates products whose count differs from Square', async () => {
    const mockBatchGet = jest.fn().mockResolvedValue({
      data: [{ catalogObjectId: 'var1', quantity: '10', state: 'IN_STOCK' }],
    })
    mockGetSquareClientFn.mockResolvedValue({
      client: { inventory: { batchGetCounts: mockBatchGet } },
      locationId: 'loc1',
    })
    // from('products').select(...) — fetch all
    mockFrom
      .mockReturnValueOnce(b({ data: [{ id: 'p1', square_variation_id: 'var1', stock_count: 5 }], error: null }))
      // from('products').update(...).eq(...) — update
      .mockReturnValue(b({ data: null, error: null }))

    const result = await pullInventoryFromSquare()
    expect(result.updated).toBe(1)
    expect(result.skipped).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it('skips products whose count already matches', async () => {
    const mockBatchGet = jest.fn().mockResolvedValue({
      data: [{ catalogObjectId: 'var1', quantity: '5', state: 'IN_STOCK' }],
    })
    mockGetSquareClientFn.mockResolvedValue({
      client: { inventory: { batchGetCounts: mockBatchGet } },
      locationId: 'loc1',
    })
    mockFrom.mockReturnValue(b({ data: [{ id: 'p1', square_variation_id: 'var1', stock_count: 5 }], error: null }))

    const result = await pullInventoryFromSquare()
    expect(result.skipped).toBe(1)
    expect(result.updated).toBe(0)
  })

  it('skips products not found in Square counts', async () => {
    const mockBatchGet = jest.fn().mockResolvedValue({ data: [] })
    mockGetSquareClientFn.mockResolvedValue({
      client: { inventory: { batchGetCounts: mockBatchGet } },
      locationId: 'loc1',
    })
    mockFrom.mockReturnValue(b({ data: [{ id: 'p1', square_variation_id: 'var1', stock_count: 5 }], error: null }))

    const result = await pullInventoryFromSquare()
    expect(result.skipped).toBe(1)
  })

  it('throws when initial DB fetch fails', async () => {
    mockGetSquareClientFn.mockResolvedValue({ client: {}, locationId: 'loc1' })
    mockFrom.mockReturnValue(b({ data: null, error: { message: 'DB down' } }))

    await expect(pullInventoryFromSquare()).rejects.toThrow('Failed to fetch products')
  })

  it('records error for products that fail to update', async () => {
    const mockBatchGet = jest.fn().mockResolvedValue({
      data: [{ catalogObjectId: 'var1', quantity: '10', state: 'IN_STOCK' }],
    })
    mockGetSquareClientFn.mockResolvedValue({
      client: { inventory: { batchGetCounts: mockBatchGet } },
      locationId: 'loc1',
    })
    mockFrom
      .mockReturnValueOnce(b({ data: [{ id: 'p1', square_variation_id: 'var1', stock_count: 5 }], error: null }))
      .mockReturnValue(b({ data: null, error: { message: 'update failed' } }))

    const result = await pullInventoryFromSquare()
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('p1')
    expect(result.updated).toBe(0)
  })
})

// ── pushProduct ───────────────────────────────────────────────────────────────

describe('pushProduct', () => {
  it('returns success and updates DB with catalog and variation IDs', async () => {
    const mockUpsert = jest.fn().mockResolvedValue({
      catalogObject: {
        id: 'sq-catalog-1',
        itemData: { variations: [{ id: 'sq-var-1' }] },
      },
    })
    const mockBatch = jest.fn().mockResolvedValue({})
    mockGetSquareClientFn.mockResolvedValue({
      client: {
        catalog: { object: { upsert: mockUpsert, delete: jest.fn().mockResolvedValue({}) } },
        inventory: { batchCreateChanges: mockBatch },
      },
      locationId: 'loc1',
    })
    // category lookup, then products update
    mockFrom
      .mockReturnValueOnce(b({ data: { square_category_id: 'sq-cat-1' }, error: null }))
      .mockReturnValue(b({ data: null, error: null }))

    const result = await pushProduct(product)
    expect(result.success).toBe(true)
    expect(mockUpsert).toHaveBeenCalledTimes(1)
    expect(mockBatch).toHaveBeenCalledTimes(1)
    // Verify PHYSICAL_COUNT type for new inventory push
    const batchCall = mockBatch.mock.calls[0][0]
    expect(batchCall.changes[0].type).toBe('PHYSICAL_COUNT')
  })

  it('deletes existing Square item before re-upsert when square_catalog_id is set', async () => {
    const mockDelete = jest.fn().mockResolvedValue({})
    const mockUpsert = jest.fn().mockResolvedValue({
      catalogObject: { id: 'sq-catalog-2', itemData: { variations: [{ id: 'sq-var-2' }] } },
    })
    mockGetSquareClientFn.mockResolvedValue({
      client: {
        catalog: { object: { upsert: mockUpsert, delete: mockDelete } },
        inventory: { batchCreateChanges: jest.fn().mockResolvedValue({}) },
      },
      locationId: 'loc1',
    })
    mockFrom
      .mockReturnValueOnce(b({ data: null, error: null })) // category lookup (no match)
      .mockReturnValue(b({ data: null, error: null }))    // products update

    await pushProduct({ ...product, square_catalog_id: 'old-sq-id' })
    expect(mockDelete).toHaveBeenCalledWith({ objectId: 'old-sq-id' })
  })

  it('returns failure when Square upsert returns no ID', async () => {
    mockGetSquareClientFn.mockResolvedValue({
      client: {
        catalog: { object: { upsert: jest.fn().mockResolvedValue({ catalogObject: null }), delete: jest.fn() } },
        inventory: { batchCreateChanges: jest.fn() },
      },
      locationId: 'loc1',
    })
    mockFrom.mockReturnValue(b({ data: null, error: null }))

    const result = await pushProduct(product)
    expect(result.success).toBe(false)
    expect(result.error).toContain('no catalog object ID')
  })

  it('returns failure when DB update fails', async () => {
    mockGetSquareClientFn.mockResolvedValue({
      client: {
        catalog: {
          object: {
            upsert: jest.fn().mockResolvedValue({
              catalogObject: { id: 'sq-catalog-1', itemData: { variations: [{ id: 'sq-var-1' }] } },
            }),
            delete: jest.fn(),
          },
        },
        inventory: { batchCreateChanges: jest.fn().mockResolvedValue({}) },
      },
      locationId: 'loc1',
    })
    mockFrom
      .mockReturnValueOnce(b({ data: null, error: null })) // category lookup
      .mockReturnValue(b({ data: null, error: { message: 'write error' } })) // products update

    const result = await pushProduct(product)
    expect(result.success).toBe(false)
    expect(result.error).toContain('write error')
  })
})

// ── pushCategory ──────────────────────────────────────────────────────────────

describe('pushCategory', () => {
  it('upserts new category and saves square_category_id to DB', async () => {
    const mockUpsert = jest.fn().mockResolvedValue({ catalogObject: { id: 'sq-cat-new' } })
    mockGetSquareClientFn.mockResolvedValue({
      client: { catalog: { object: { upsert: mockUpsert, delete: jest.fn() } } },
    })
    mockFrom.mockReturnValue(b({ data: null, error: null }))

    const result = await pushCategory(category)
    expect(result.success).toBe(true)
    expect(mockUpsert).toHaveBeenCalledTimes(1)
  })

  it('deletes existing Square category before re-upsert', async () => {
    const mockDelete = jest.fn().mockResolvedValue({})
    const mockUpsert = jest.fn().mockResolvedValue({ catalogObject: { id: 'sq-cat-new' } })
    mockGetSquareClientFn.mockResolvedValue({
      client: { catalog: { object: { upsert: mockUpsert, delete: mockDelete } } },
    })
    mockFrom.mockReturnValue(b({ data: null, error: null }))

    await pushCategory({ ...category, square_category_id: 'old-sq-cat' })
    expect(mockDelete).toHaveBeenCalledWith({ objectId: 'old-sq-cat' })
  })

  it('returns failure when Square upsert returns no ID', async () => {
    mockGetSquareClientFn.mockResolvedValue({
      client: { catalog: { object: { upsert: jest.fn().mockResolvedValue({ catalogObject: null }), delete: jest.fn() } } },
    })
    mockFrom.mockReturnValue(b({ data: null, error: null }))

    const result = await pushCategory(category)
    expect(result.success).toBe(false)
  })
})

// ── deleteSquareCategory ──────────────────────────────────────────────────────

describe('deleteSquareCategory', () => {
  it('calls Square catalog delete', async () => {
    const mockDelete = jest.fn().mockResolvedValue({})
    mockGetSquareClientFn.mockResolvedValue({
      client: { catalog: { object: { delete: mockDelete } } },
    })

    await deleteSquareCategory('sq-cat-1')
    expect(mockDelete).toHaveBeenCalledWith({ objectId: 'sq-cat-1' })
  })

  it('ignores 404 errors silently', async () => {
    mockGetSquareClientFn.mockResolvedValue({
      client: { catalog: { object: { delete: jest.fn().mockRejectedValue(new Error('404 not found')) } } },
    })

    await expect(deleteSquareCategory('sq-cat-missing')).resolves.toBeUndefined()
  })
})

// ── pullCategoriesFromSquare ──────────────────────────────────────────────────

describe('pullCategoriesFromSquare', () => {
  const squareCats = [
    { type: 'CATEGORY', id: 'sq-known', categoryData: { name: 'Rings', onlineVisibility: true } },
    { type: 'CATEGORY', id: 'sq-new', categoryData: { name: 'Necklaces', onlineVisibility: false } },
    { type: 'CATEGORY', id: 'sq-noname', categoryData: {} },      // should be skipped
    { type: 'ITEM', id: 'sq-item', itemData: { name: 'Thing' } }, // wrong type, skipped
  ]

  it('updates existing categories and inserts new ones', async () => {
    mockGetSquareClientFn.mockResolvedValue({
      client: { catalog: { list: jest.fn().mockReturnValue(asyncIter(squareCats)) } },
    })
    mockFrom
      .mockReturnValueOnce(b({ data: { id: 'local-1' }, error: null })) // existing check sq-known
      .mockReturnValueOnce(b({ data: null, error: null }))               // update sq-known
      .mockReturnValueOnce(b({ data: null, error: null }))               // existing check sq-new (not found)
      .mockReturnValue(b({ data: null, error: null }))                   // insert sq-new

    const result = await pullCategoriesFromSquare()
    expect(result.upserted).toBe(2)
    expect(result.errors).toHaveLength(0)
  })

  it('silently ignores slug collision on insert', async () => {
    mockGetSquareClientFn.mockResolvedValue({
      client: { catalog: { list: jest.fn().mockReturnValue(asyncIter([squareCats[1]])) } },
    })
    mockFrom
      .mockReturnValueOnce(b({ data: null, error: null })) // not found
      .mockReturnValue(b({ data: null, error: { message: 'duplicate key unique constraint' } }))

    const result = await pullCategoriesFromSquare()
    expect(result.errors).toHaveLength(0) // slug collision is not an error
  })

  it('records error when update fails', async () => {
    mockGetSquareClientFn.mockResolvedValue({
      client: { catalog: { list: jest.fn().mockReturnValue(asyncIter([squareCats[0]])) } },
    })
    mockFrom
      .mockReturnValueOnce(b({ data: { id: 'local-1' }, error: null }))
      .mockReturnValue(b({ data: null, error: { message: 'write failed' } }))

    const result = await pullCategoriesFromSquare()
    expect(result.errors).toHaveLength(1)
    expect(result.upserted).toBe(0)
  })
})

// ── pullProductsFromSquare ────────────────────────────────────────────────────

describe('pullProductsFromSquare', () => {
  const variation = { id: 'sq-var-1', itemVariationData: { priceMoney: { amount: BigInt(4500) } } }
  const squareItems = [
    {
      type: 'ITEM',
      id: 'sq-prod-known',
      itemData: { name: 'Ring', description: 'Nice', variations: [variation], categories: [{ id: 'sq-cat-1' }] },
    },
    {
      type: 'ITEM',
      id: 'sq-prod-new',
      itemData: { name: 'Bracelet', variations: [variation] },
    },
    { type: 'ITEM', id: 'sq-noname', itemData: {} }, // no name, skipped
  ]

  it('updates existing products and inserts new ones', async () => {
    mockGetSquareClientFn.mockResolvedValue({
      client: { catalog: { list: jest.fn().mockReturnValue(asyncIter(squareItems)) } },
    })
    mockFrom
      .mockReturnValueOnce(b({ data: { id: 'local-cat-1' }, error: null })) // category lookup for sq-prod-known
      .mockReturnValueOnce(b({ data: { id: 'local-prod-1' }, error: null })) // existing product check
      .mockReturnValueOnce(b({ data: null, error: null }))                    // update product
      .mockReturnValueOnce(b({ data: { id: 'local-prod-2' }, error: null })) // existing check (not found → null below)

    // sq-prod-new: no category, existing check not found, then insert
    mockFrom
      .mockReturnValueOnce(b({ data: null, error: null })) // existing check sq-prod-new (not found)
      .mockReturnValue(b({ data: null, error: null }))     // insert sq-prod-new

    const result = await pullProductsFromSquare()
    expect(result.upserted).toBe(2)
    expect(result.errors).toHaveLength(0)
  })

  it('resolves category link from Square category ID', async () => {
    const mockList = jest.fn().mockReturnValue(asyncIter([squareItems[0]]))
    mockGetSquareClientFn.mockResolvedValue({
      client: { catalog: { list: mockList } },
    })
    const mockUpdateFn = jest.fn().mockReturnThis()
    mockFrom
      .mockReturnValueOnce(b({ data: { id: 'local-cat-1' }, error: null })) // category lookup
      .mockReturnValueOnce(b({ data: { id: 'local-prod-1' }, error: null })) // existing product
      .mockReturnValueOnce({                                                   // update — capture it
        update: mockUpdateFn,
        eq: jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
      })

    await pullProductsFromSquare()
    expect(mockUpdateFn).toHaveBeenCalledWith(
      expect.objectContaining({ category_id: 'local-cat-1' }),
    )
  })

  it('silently ignores slug collision on insert', async () => {
    mockGetSquareClientFn.mockResolvedValue({
      client: { catalog: { list: jest.fn().mockReturnValue(asyncIter([squareItems[1]])) } },
    })
    mockFrom
      .mockReturnValueOnce(b({ data: null, error: null })) // existing check (not found)
      .mockReturnValue(b({ data: null, error: { message: 'unique constraint violation' } }))

    const result = await pullProductsFromSquare()
    expect(result.errors).toHaveLength(0)
  })
})

// ── fullSync ──────────────────────────────────────────────────────────────────

describe('fullSync', () => {
  it('calls pushProduct for each product and returns all results', async () => {
    const mockUpsert = jest.fn().mockResolvedValue({
      catalogObject: { id: 'sq-cat-1', itemData: { variations: [{ id: 'sq-var-1' }] } },
    })
    mockGetSquareClientFn.mockResolvedValue({
      client: {
        catalog: { object: { upsert: mockUpsert, delete: jest.fn().mockResolvedValue({}) } },
        inventory: { batchCreateChanges: jest.fn().mockResolvedValue({}) },
      },
      locationId: 'loc1',
    })
    mockFrom.mockReturnValue(b({ data: null, error: null }))

    const products = [product, { ...product, id: 'prod-2', slug: 'ring-2' }]
    const results = await fullSync(products)
    expect(results).toHaveLength(2)
    expect(results.every(r => r.success)).toBe(true)
  })
})
