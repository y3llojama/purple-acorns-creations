/**
 * @jest-environment node
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

// Default Supabase query builder — variation-aware
function makeBuilder(table: string) {
  const value =
    table === 'product_variations'
      ? {
          data: [
            {
              id: 'v1',
              product_id: 'p1',
              price: 45,
              stock_count: 2,
              stock_reserved: 0,
              is_active: true,
              square_variation_id: 'sq-var-1',
              product: { id: 'p1', name: 'Ring' },
            },
          ],
        }
      : table === 'settings'
        ? { data: { shipping_mode: 'fixed', shipping_value: 0 } }
        : { data: null }
  return {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) => resolve(value),
  }
}

const makeRequest = (body: unknown, ip = 'unknown') =>
  new Request('http://localhost/api/shop/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-real-ip': ip },
    body: JSON.stringify(body),
  })

// Variation-aware cart payload
const validBody = {
  cart: [{ productId: 'p1', variationId: 'v1', quantity: 1 }],
  sourceId: 'cnon:card-nonce-ok',
  verificationToken: 'vtok_test',
  shipping: {
    name: 'Jane Doe',
    address1: '123 Main St',
    city: 'Portland',
    state: 'OR',
    zip: '97201',
    country: 'US',
  },
}

describe('POST /api/shop/checkout', () => {
  let POST: (req: Request) => Promise<Response>

  beforeAll(async () => {
    const module = await import('@/app/api/shop/checkout/route')
    POST = module.POST
  })

  beforeEach(() => {
    jest.resetAllMocks()
    mockPushInventory.mockResolvedValue(undefined)
    mockFrom.mockImplementation(makeBuilder)
  })

  // ── Input validation ──

  it('returns 400 with empty cart', async () => {
    const res = await POST(
      makeRequest({ cart: [], sourceId: 'tok', verificationToken: 'vtok', shipping: validBody.shipping }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 with missing sourceId', async () => {
    const res = await POST(makeRequest({ cart: validBody.cart, shipping: validBody.shipping }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when verificationToken is missing', async () => {
    const res = await POST(
      makeRequest({ cart: validBody.cart, sourceId: 'tok', shipping: validBody.shipping }),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Buyer verification required.')
  })

  it('returns 400 when shipping address is missing', async () => {
    const res = await POST(
      makeRequest({ cart: validBody.cart, sourceId: 'tok', verificationToken: 'vtok' }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when shipping fields are incomplete', async () => {
    const res = await POST(makeRequest({ ...validBody, shipping: { name: 'Jane' } }))
    expect(res.status).toBe(400)
  })

  it('returns 400 with invalid cart quantity (zero)', async () => {
    const res = await POST(
      makeRequest({ ...validBody, cart: [{ productId: 'p1', variationId: 'v1', quantity: 0 }] }),
    )
    expect(res.status).toBe(400)
  })

  // ── Rate limiting ──

  it('returns 429 after exceeding 10 requests per IP', async () => {
    const ip = 'ratelimit-test'
    const req = () => makeRequest({}, ip)
    for (let i = 0; i < 10; i++) await POST(req())
    expect((await POST(req())).status).toBe(429)
  })

  // ── Variation-aware payment flow ──

  it('calls decrement_variation_stock RPC (not decrement_stock)', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'v1' }], error: null })
    mockGetSquareClientFn.mockResolvedValue({
      client: {
        orders: { create: jest.fn().mockResolvedValue({ order: { id: 'order123' } }) },
        payments: { create: jest.fn().mockResolvedValue({ payment: { id: 'pay123' } }) },
      },
      locationId: 'loc1',
    })

    await POST(makeRequest(validBody, '10.0.0.1'))
    expect(mockRpc).toHaveBeenCalledWith('decrement_variation_stock', { var_id: 'v1', qty: 1 })
    expect(mockRpc).not.toHaveBeenCalledWith('decrement_stock', expect.anything())
  })

  it('reads price from product_variations, not products table', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'v1' }], error: null })
    mockGetSquareClientFn.mockResolvedValue({
      client: {
        orders: { create: jest.fn().mockResolvedValue({ order: { id: 'order123' } }) },
        payments: { create: jest.fn().mockResolvedValue({ payment: { id: 'pay123' } }) },
      },
      locationId: 'loc1',
    })

    await POST(makeRequest(validBody, '10.0.0.5'))
    const fromCalls = mockFrom.mock.calls.map((c: unknown[]) => c[0])
    expect(fromCalls).toContain('product_variations')
    expect(fromCalls).not.toContain('products')
  })

  it('returns 200 with orderId and paymentId on success', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'v1' }], error: null })
    mockGetSquareClientFn.mockResolvedValue({
      client: {
        orders: { create: jest.fn().mockResolvedValue({ order: { id: 'order123' } }) },
        payments: { create: jest.fn().mockResolvedValue({ payment: { id: 'pay123' } }) },
      },
      locationId: 'loc1',
    })

    const res = await POST(makeRequest(validBody, '10.0.0.6'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.orderId).toBe('order123')
    expect(data.paymentId).toBe('pay123')
  })

  it('returns 409 when variation is sold out', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })

    const res = await POST(makeRequest(validBody, '10.0.0.2'))
    expect(res.status).toBe(409)
  })

  it('returns 500 on stock reservation DB error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'connection error' } })

    const res = await POST(makeRequest(validBody, '10.0.0.3'))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/reserve stock/i)
  })

  it('calls increment_variation_stock on payment failure rollback', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: [{ id: 'v1' }], error: null })
      .mockResolvedValue({ data: null, error: null })

    mockGetSquareClientFn.mockResolvedValue({
      client: {
        orders: { create: jest.fn().mockResolvedValue({ order: { id: 'order123' } }) },
        payments: { create: jest.fn().mockRejectedValue(new Error('Card declined')) },
      },
      locationId: 'loc1',
    })

    const res = await POST(makeRequest(validBody, '10.0.0.4'))
    expect(res.status).toBe(402)
    expect(mockRpc).toHaveBeenCalledWith('increment_variation_stock', { var_id: 'v1', qty: 1 })
    expect(mockRpc).not.toHaveBeenCalledWith('increment_stock', expect.anything())
  })

  it('pushes inventory to Square using variation square_variation_id', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'v1' }], error: null })
    mockGetSquareClientFn.mockResolvedValue({
      client: {
        orders: { create: jest.fn().mockResolvedValue({ order: { id: 'order123' } }) },
        payments: { create: jest.fn().mockResolvedValue({ payment: { id: 'pay123' } }) },
      },
      locationId: 'loc1',
    })

    await POST(makeRequest(validBody, '10.0.0.7'))
    expect(mockPushInventory).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ squareVariationId: 'sq-var-1', quantity: 1 }),
      ]),
    )
  })
})
