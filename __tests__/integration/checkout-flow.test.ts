/**
 * @jest-environment node
 *
 * Integration test: validates the full checkout flow with variation-aware
 * cart, stock decrement, payment, and inventory push all work together.
 */

const mockRpc = jest.fn()
const mockFrom = jest.fn()
const mockPushInventory = jest.fn()
const mockGetSquareClientFn = jest.fn()

jest.mock('@/lib/channels/square/catalog', () => ({
  pushInventoryToSquare: (...args: unknown[]) => mockPushInventory(...args),
}))
jest.mock('@/lib/channels/square/client', () => ({
  getSquareClient: (...args: unknown[]) => mockGetSquareClientFn(...args),
}))
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}))

describe('Integration: checkout with variations', () => {
  let POST: (req: Request) => Promise<Response>

  beforeAll(async () => {
    const module = await import('@/app/api/shop/checkout/route')
    POST = module.POST
  })

  beforeEach(() => {
    jest.resetAllMocks()
    mockPushInventory.mockResolvedValue(undefined)
  })

  it('multi-variation cart: decrements each variation independently', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'product_variations') return {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) => resolve({
          data: [
            { id: 'v1', product_id: 'p1', price: 45, stock_count: 3, stock_reserved: 0, is_active: true, square_variation_id: 'sq-v1', product: { id: 'p1', name: 'Ring' } },
            { id: 'v2', product_id: 'p1', price: 55, stock_count: 2, stock_reserved: 0, is_active: true, square_variation_id: 'sq-v2', product: { id: 'p1', name: 'Ring' } },
          ],
        }),
      }
      if (table === 'settings') return {
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) => resolve({
          data: { shipping_mode: 'fixed', shipping_value: 0 },
        }),
      }
      return { select: jest.fn().mockReturnThis() }
    })

    mockRpc
      .mockResolvedValueOnce({ data: [{ id: 'v1' }], error: null })
      .mockResolvedValueOnce({ data: [{ id: 'v2' }], error: null })

    mockGetSquareClientFn.mockResolvedValue({
      client: {
        orders: { create: jest.fn().mockResolvedValue({ order: { id: 'order1' } }) },
        payments: { create: jest.fn().mockResolvedValue({ payment: { id: 'pay1' } }) },
      },
      locationId: 'loc1',
    })

    const req = new Request('http://localhost/api/shop/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': '10.0.1.1' },
      body: JSON.stringify({
        cart: [
          { productId: 'p1', variationId: 'v1', quantity: 1 },
          { productId: 'p1', variationId: 'v2', quantity: 1 },
        ],
        sourceId: 'cnon:card-nonce-ok',
        verificationToken: 'vtok_test',
        shipping: { name: 'Jane', address1: '123 Main', city: 'Portland', state: 'OR', zip: '97201', country: 'US' },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    expect(mockRpc).toHaveBeenCalledWith('decrement_variation_stock', { var_id: 'v1', qty: 1 })
    expect(mockRpc).toHaveBeenCalledWith('decrement_variation_stock', { var_id: 'v2', qty: 1 })

    expect(mockPushInventory).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ squareVariationId: 'sq-v1' }),
        expect.objectContaining({ squareVariationId: 'sq-v2' }),
      ]),
    )
  })

  it('partial sold-out: rolls back all decrements when any variation is unavailable', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'product_variations') return {
        select: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) => resolve({
          data: [
            { id: 'v1', product_id: 'p1', price: 45, stock_count: 3, stock_reserved: 0, is_active: true, square_variation_id: 'sq-v1', product: { id: 'p1', name: 'Ring' } },
            { id: 'v2', product_id: 'p1', price: 55, stock_count: 0, stock_reserved: 0, is_active: true, square_variation_id: 'sq-v2', product: { id: 'p1', name: 'Ring' } },
          ],
        }),
      }
      if (table === 'settings') return {
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) => resolve({
          data: { shipping_mode: 'fixed', shipping_value: 0 },
        }),
      }
      return { select: jest.fn().mockReturnThis() }
    })

    mockRpc
      .mockResolvedValueOnce({ data: [{ id: 'v1' }], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValue({ data: null, error: null })

    const req = new Request('http://localhost/api/shop/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': '10.0.1.2' },
      body: JSON.stringify({
        cart: [
          { productId: 'p1', variationId: 'v1', quantity: 1 },
          { productId: 'p1', variationId: 'v2', quantity: 1 },
        ],
        sourceId: 'cnon:card-nonce-ok',
        verificationToken: 'vtok_test',
        shipping: { name: 'Jane', address1: '123 Main', city: 'Portland', state: 'OR', zip: '97201', country: 'US' },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(409)

    expect(mockRpc).toHaveBeenCalledWith('increment_variation_stock', { var_id: 'v1', qty: 1 })
  })
})
