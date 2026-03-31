/**
 * @jest-environment node
 */

const mockInsert = jest.fn()
const mockUpdate = jest.fn()
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

function makeSyncLogBuilder(existing: { id: string } | null) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: existing, error: null }),
    insert: mockInsert,
    update: jest.fn().mockReturnValue({ eq: mockUpdate }),
  }
}

describe('logSyncResults — select+update/insert pattern (R14)', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    mockInsert.mockReturnValue({
      then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
    })
    mockUpdate.mockReturnValue({
      then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
    })
  })

  it('inserts new sync log when no existing row', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'settings') return {
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) => resolve({
          data: { square_sync_enabled: true, pinterest_sync_enabled: false },
        }),
      }
      if (table === 'channel_sync_log') return makeSyncLogBuilder(null)
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

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ product_id: 'p1', channel: 'square' }),
    )
  })

  it('updates existing sync log when row exists', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'settings') return {
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) => resolve({
          data: { square_sync_enabled: true, pinterest_sync_enabled: false },
        }),
      }
      if (table === 'channel_sync_log') return makeSyncLogBuilder({ id: 'log-1' })
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
      }
    })

    jest.resetModules()
    const { syncProduct } = await import('@/lib/channels/index')
    const product = {
      id: 'p1', name: 'Ring', price: 45, description: null, category_id: null,
      stock_count: 3, images: [], is_active: true, gallery_featured: false,
      square_catalog_id: null, square_variation_id: null, slug: 'ring',
    }
    await syncProduct(product as any)

    expect(mockUpdate).toHaveBeenCalledWith('id', 'log-1')
    expect(mockInsert).not.toHaveBeenCalled()
  })
})
