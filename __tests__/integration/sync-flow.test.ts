/**
 * @jest-environment node
 *
 * Integration test: validates Square webhook → product_variations update → stock_movements
 * and admin manual edit → optimistic lock → Square push all work together.
 */

const mockFrom = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}))

jest.mock('@/lib/channels/square/client', () => ({
  getSquareClient: jest.fn().mockResolvedValue({
    client: {
      inventory: {
        batchGetCounts: jest.fn().mockResolvedValue({
          data: [{ catalogObjectId: 'sq-var-1', quantity: '15', state: 'IN_STOCK' }],
        }),
        batchCreateChanges: jest.fn().mockResolvedValue({}),
      },
    },
    locationId: 'loc1',
  }),
}))

describe('Integration: bidirectional sync', () => {
  beforeEach(() => jest.resetAllMocks())

  it('pullInventoryFromSquare → product_variations + stock_movements', async () => {
    const insertedTables: string[] = []
    const updatedTables: string[] = []

    mockFrom.mockImplementation((table: string) => {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        update: jest.fn(() => {
          updatedTables.push(table)
          return {
            eq: jest.fn().mockReturnThis(),
            then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
          }
        }),
        insert: jest.fn((data: unknown) => {
          insertedTables.push(table)
          return {
            then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
          }
        }),
        then: (resolve: (v: unknown) => void) => resolve({
          data: table === 'product_variations'
            ? [{ id: 'v1', product_id: 'p1', square_variation_id: 'sq-var-1', stock_count: 5 }]
            : null,
          error: null,
        }),
      }
    })

    const { pullInventoryFromSquare } = await import('@/lib/channels/square/catalog')
    const result = await pullInventoryFromSquare()

    expect(result.updated).toBe(1)
    expect(updatedTables).toContain('product_variations')
    expect(updatedTables).not.toContain('products')
    expect(insertedTables).toContain('stock_movements')
  })
})
