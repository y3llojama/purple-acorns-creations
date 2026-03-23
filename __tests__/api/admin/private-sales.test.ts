/**
 * @jest-environment node
 */
jest.mock('@/lib/auth', () => ({
  requireAdminSession: jest.fn().mockResolvedValue({ user: { email: 'admin@test.com' }, error: null }),
}))
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ data: [{ id: 'p1', is_active: true }], error: null }),
      filter: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
    rpc: jest.fn().mockResolvedValue({
      data: { id: 'sale1', token: 'token-uuid', expires_at: new Date(Date.now() + 86400000).toISOString(), created_at: new Date().toISOString() },
      error: null,
    }),
  })),
}))

describe('POST /api/admin/private-sales', () => {
  beforeEach(() => jest.resetModules())

  it('returns 400 when items is empty', async () => {
    const { POST } = await import('@/app/api/admin/private-sales/route')
    const req = new Request('http://localhost/api/admin/private-sales', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [], expiresIn: '7d' }),
    })
    expect((await POST(req)).status).toBe(400)
  })

  it('returns 400 when expiresIn is invalid', async () => {
    const { POST } = await import('@/app/api/admin/private-sales/route')
    const req = new Request('http://localhost/api/admin/private-sales', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1, customPrice: 45 }], expiresIn: '99d' }),
    })
    expect((await POST(req)).status).toBe(400)
  })

  it('returns 400 when customPrice is not positive', async () => {
    const { POST } = await import('@/app/api/admin/private-sales/route')
    const req = new Request('http://localhost/api/admin/private-sales', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1, customPrice: 0 }], expiresIn: '7d' }),
    })
    expect((await POST(req)).status).toBe(400)
  })

  it('returns 201 with valid body', async () => {
    const { POST } = await import('@/app/api/admin/private-sales/route')
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com'
    const req = new Request('http://localhost/api/admin/private-sales', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1, customPrice: 45 }], expiresIn: '7d' }),
    })
    expect((await POST(req)).status).toBe(201)
  })
})
