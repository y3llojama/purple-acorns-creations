/**
 * @jest-environment node
 */

const mockFrom = jest.fn()

jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}))

jest.mock('@/lib/channels/pinterest/client', () => ({
  getPinterestHeaders: jest.fn().mockResolvedValue({
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    catalogId: 'test-catalog-id',
  }),
}))

// Mock global fetch for Pinterest API
const originalFetch = global.fetch
beforeAll(() => {
  global.fetch = jest.fn()
})
afterAll(() => {
  global.fetch = originalFetch
})

describe('Pinterest catalog — variation-aware pricing (R15)', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ batch_id: 'pin-123' }),
    })
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
    })
  })

  it('sends price from product to Pinterest catalog', async () => {
    const { pushProduct } = await import('@/lib/channels/pinterest/catalog')
    const product = {
      id: 'p1', name: 'Ring', price: 45, description: 'A ring', category_id: null,
      stock_count: 3, images: ['https://example.com/img.jpg'], is_active: true,
      gallery_featured: false, square_catalog_id: null, square_variation_id: null, slug: 'ring',
    }

    await pushProduct(product as any)

    // Verify fetch was called (Pinterest push happened)
    expect(global.fetch).toHaveBeenCalled()

    // Verify the price was sent correctly in the request body
    const fetchCall = (global.fetch as jest.Mock).mock.calls[0]
    const body = JSON.parse(fetchCall[1].body)
    expect(body.items[0].attributes.price).toBe('45.00 USD')
  })
})
