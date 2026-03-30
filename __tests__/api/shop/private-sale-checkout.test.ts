/**
 * @jest-environment node
 */
jest.mock('@/lib/channels/square/client', () => ({ getSquareClient: jest.fn() }))

const mockRpc = jest.fn()

const mockSale = {
  id: 'sale1',
  token: 'tok-uuid',
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  used_at: null, revoked_at: null,
  items: [{ product_id: 'p1', variation_id: 'v1', quantity: 1, custom_price: 45 }],
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
      if (table === 'product_variations') return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'v1', product_id: 'p1', stock_count: 5, stock_reserved: 0, is_active: true },
        }),
      }
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() }
    }),
    rpc: (...args: unknown[]) => mockRpc(...args),
  })),
}))

describe('POST /api/shop/private-sale/[token]/checkout', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRpc.mockResolvedValue({ data: { ...mockSale, used_at: new Date().toISOString() }, error: null })
  })

  const validBody = {
    sourceId: 'sq_tok',
    verificationToken: 'test-verification-token',
    shipping: { name: 'Jane', address1: '123 Main', city: 'Portland', state: 'OR', zip: '97201', country: 'US' },
  }

  it('returns 400 when verificationToken is missing', async () => {
    const { POST } = await import('@/app/api/shop/private-sale/[token]/checkout/route')
    const req = new Request('http://localhost/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: 'sq_tok', shipping: validBody.shipping }),
    })
    const res = await POST(req, { params: Promise.resolve({ token: 'tok-uuid' }) })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Buyer verification required.')
  })

  it('returns 400 when shipping address missing', async () => {
    const { POST } = await import('@/app/api/shop/private-sale/[token]/checkout/route')
    const req = new Request('http://localhost/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId: 'sq_tok', verificationToken: 'test-verification-token' }),
    })
    const res = await POST(req, { params: Promise.resolve({ token: 'tok-uuid' }) })
    expect(res.status).toBe(400)
  })

  it('calls decrement_variation_stock, not decrement_stock (R7)', async () => {
    const { getSquareClient } = await import('@/lib/channels/square/client') as any
    getSquareClient.mockResolvedValue({
      client: {
        orders: { create: jest.fn().mockResolvedValue({ order: { id: 'order1' } }) },
        payments: { create: jest.fn().mockResolvedValue({ payment: { id: 'pay1' } }) },
      },
      locationId: 'loc1',
    })
    const { POST } = await import('@/app/api/shop/private-sale/[token]/checkout/route')
    const req = new Request('http://localhost/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    })
    await POST(req, { params: Promise.resolve({ token: 'tok-uuid' }) })
    expect(mockRpc).toHaveBeenCalledWith(
      expect.stringContaining('variation'),
      expect.anything(),
    )
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
  })

  it('prevents double-sell: second checkout returns error after used_at set (R7 regression)', async () => {
    const usedSale = { ...mockSale, used_at: new Date().toISOString() }
    const { createServiceRoleClient } = require('@/lib/supabase/server')
    createServiceRoleClient.mockReturnValueOnce({
      from: jest.fn((table: string) => {
        if (table === 'private_sales') return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: usedSale }),
        }
        return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() }
      }),
      rpc: mockRpc,
    })
    const { POST } = await import('@/app/api/shop/private-sale/[token]/checkout/route')
    const req = new Request('http://localhost/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    })
    const res = await POST(req, { params: Promise.resolve({ token: 'tok-uuid' }) })
    expect(res.status).toBe(410)
  })
})
