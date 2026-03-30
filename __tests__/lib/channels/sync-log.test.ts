/**
 * @jest-environment node
 */

const mockUpsert = jest.fn()
const mockFrom = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}))

jest.mock('@/lib/channels/square/catalog', () => ({
  pushProduct: jest.fn().mockResolvedValue({ productId: 'p1', channel: 'square', success: true }),
}))
jest.mock('@/lib/channels/pinterest/catalog', () => ({
  pushProduct: jest.fn().mockResolvedValue({ productId: 'p1', channel: 'pinterest', success: true }),
}))

describe('logSyncResults — conflict key (R14)', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockUpsert.mockReturnValue({
      then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
    })
  })

  it('uses conflict key including product_id and channel', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'settings') return {
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) => resolve({
          data: { square_sync_enabled: true, pinterest_sync_enabled: false },
        }),
      }
      if (table === 'channel_sync_log') return { upsert: mockUpsert }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
      }
    })

    const { syncProduct } = await import('@/lib/channels/index')
    const product = {
      id: 'p1', name: 'Ring', price: 45, description: null, category_id: null,
      stock_count: 3, images: [], is_active: true, gallery_featured: false,
      square_catalog_id: null, square_variation_id: null, slug: 'ring',
    }
    await syncProduct(product as any)

    expect(mockUpsert).toHaveBeenCalled()
    const upsertCall = mockUpsert.mock.calls[0]
    const options = upsertCall[1]
    expect(options.onConflict).toContain('product_id')
    expect(options.onConflict).toContain('channel')
  })
})
