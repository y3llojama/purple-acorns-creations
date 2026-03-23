/**
 * @jest-environment node
 */
jest.mock('@/lib/channels/square/client', () => ({ getSquareClient: jest.fn() }))

const mockSale = {
  id: 'sale1',
  token: 'tok-uuid',
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  used_at: null, revoked_at: null,
  items: [{ product_id: 'p1', quantity: 1, custom_price: 45 }],
}

jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'private_sales') return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: mockSale }),
      }
      if (table === 'settings') return {
        select: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: { shipping_mode: 'fixed', shipping_value: 0 } }),
      }
      if (table === 'products') return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'p1', stock_count: 5, stock_reserved: 0 } }),
      }
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() }
    }),
    rpc: jest.fn().mockResolvedValue({ data: { ...mockSale, used_at: new Date().toISOString() }, error: null }),
  })),
}))

describe('POST /api/shop/private-sale/[token]/checkout', () => {
  beforeEach(() => jest.clearAllMocks())

  const validBody = {
    sourceId: 'sq_tok',
    shipping: { name: 'Jane', address1: '123 Main', city: 'Portland', state: 'OR', zip: '97201', country: 'US' },
  }

  it('returns 400 when shipping address missing', async () => {
    const { POST } = await import('@/app/api/shop/private-sale/[token]/checkout/route')
    const req = new Request('http://localhost/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: 'sq_tok' }),
    })
    const res = await POST(req, { params: Promise.resolve({ token: 'tok-uuid' }) })
    expect(res.status).toBe(400)
  })

  it('returns 402 and error message when Square payment fails', async () => {
    const { getSquareClient } = await import('@/lib/channels/square/client') as any
    getSquareClient.mockResolvedValue({
      client: {
        orders: { create: jest.fn().mockResolvedValue({ order: { id: 'order1' } }) },
        payments: { create: jest.fn().mockRejectedValue(new Error('Card declined')) },
      },
      locationId: 'loc1',
    })
    const { POST } = await import('@/app/api/shop/private-sale/[token]/checkout/route')
    const req = new Request('http://localhost/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    })
    const res = await POST(req, { params: Promise.resolve({ token: 'tok-uuid' }) })
    expect(res.status).toBe(402)
    const data = await res.json()
    expect(data.error).toBeTruthy()
    expect(data.detail).toBeUndefined()
  })
})
