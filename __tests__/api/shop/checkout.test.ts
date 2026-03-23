/**
 * @jest-environment node
 */
jest.mock('@/lib/channels/square/client', () => ({ getSquareClient: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(), in: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      then: jest.fn().mockResolvedValue({ data: [{ id: 'p1', name: 'Ring', price: 45, stock_count: 2 }] }),
    })),
    rpc: jest.fn().mockResolvedValue({ data: [{ id: 'p1' }] }),
  })),
}))

describe('POST /api/shop/checkout', () => {
  it('returns 400 with empty cart', async () => {
    const { POST } = await import('@/app/api/shop/checkout/route')
    const req = new Request('http://localhost/api/shop/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart: [], sourceId: 'tok_test' }),
    })
    expect((await POST(req)).status).toBe(400)
  })

  it('returns 400 with missing sourceId', async () => {
    const { POST } = await import('@/app/api/shop/checkout/route')
    const req = new Request('http://localhost/api/shop/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart: [{ productId: 'p1', quantity: 1 }] }),
    })
    expect((await POST(req)).status).toBe(400)
  })

  it('returns 400 when shipping address is missing', async () => {
    const { POST } = await import('@/app/api/shop/checkout/route')
    const req = new Request('http://localhost/api/shop/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart: [{ productId: 'p1', quantity: 1 }], sourceId: 'tok_test' }),
      // no shipping field
    })
    expect((await POST(req)).status).toBe(400)
  })

  it('returns 400 when shipping fields are incomplete', async () => {
    const { POST } = await import('@/app/api/shop/checkout/route')
    const req = new Request('http://localhost/api/shop/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cart: [{ productId: 'p1', quantity: 1 }],
        sourceId: 'tok_test',
        shipping: { name: 'Jane' }, // missing required fields
      }),
    })
    expect((await POST(req)).status).toBe(400)
  })
})
