/**
 * @jest-environment node
 */

// Controllable mock fns — names starting with `mock` are permitted in jest.mock() factories
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

// createServiceRoleClient is a plain wrapper (not jest.fn) so resetAllMocks
// doesn't clear it; the inner mock fns are reset and re-configured per test.
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}))

// Default Supabase query builder — a thenable that resolves per-table
function makeBuilder(table: string) {
  const value =
    table === 'products'
      ? {
          data: [
            {
              id: 'p1',
              name: 'Ring',
              price: 45,
              stock_count: 2,
              stock_reserved: 0,
              square_variation_id: 'var1',
            },
          ],
        }
      : { data: { shipping_mode: 'fixed', shipping_value: 0 } }
  return {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
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

const validBody = {
  cart: [{ productId: 'p1', quantity: 1 }],
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

  // Input validation

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
      makeRequest({ ...validBody, cart: [{ productId: 'p1', quantity: 0 }] }),
    )
    expect(res.status).toBe(400)
  })

  // Rate limiting

  it('returns 429 after exceeding 10 requests per IP', async () => {
    const ip = 'ratelimit-test'
    const req = () => makeRequest({}, ip)
    for (let i = 0; i < 10; i++) await POST(req())
    expect((await POST(req())).status).toBe(429)
  })

  // Payment flows

  it('returns 200 with orderId and paymentId on success', async () => {
    mockRpc.mockResolvedValue({ data: [{ id: 'p1' }], error: null })
    mockGetSquareClientFn.mockResolvedValue({
      client: {
        orders: { create: jest.fn().mockResolvedValue({ order: { id: 'order123' } }) },
        payments: { create: jest.fn().mockResolvedValue({ payment: { id: 'pay123' } }) },
      },
      locationId: 'loc1',
    })

    const res = await POST(makeRequest(validBody, '10.0.0.1'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.orderId).toBe('order123')
    expect(data.paymentId).toBe('pay123')
  })

  it('returns 409 when product is sold out', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null })

    const res = await POST(makeRequest(validBody, '10.0.0.2'))
    expect(res.status).toBe(409)
    expect((await res.json()).soldOut).toBe('p1')
  })

  it('returns 500 on stock reservation DB error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'connection error' } })

    const res = await POST(makeRequest(validBody, '10.0.0.3'))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/reserve stock/i)
  })

  it('returns 402 on payment decline and rolls back stock', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: [{ id: 'p1' }], error: null }) // decrement_stock
      .mockResolvedValue({ data: null, error: null })                // increment_stock rollback

    mockGetSquareClientFn.mockResolvedValue({
      client: {
        orders: { create: jest.fn().mockResolvedValue({ order: { id: 'order123' } }) },
        payments: { create: jest.fn().mockRejectedValue(new Error('Card declined')) },
      },
      locationId: 'loc1',
    })

    const res = await POST(makeRequest(validBody, '10.0.0.4'))
    expect(res.status).toBe(402)
    expect((await res.json()).error).toBeTruthy()
    expect(mockRpc).toHaveBeenCalledWith('increment_stock', { product_id: 'p1', qty: 1 })
  })
})
