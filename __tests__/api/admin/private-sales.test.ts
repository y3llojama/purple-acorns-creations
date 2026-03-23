/**
 * @jest-environment node
 */

const mockRpc = jest.fn()
const mockSelect = jest.fn()
const mockIn = jest.fn()
const mockEq = jest.fn()
const mockMaybeSingle = jest.fn()
const mockRange = jest.fn()
const mockOrder = jest.fn()

jest.mock('@/lib/auth', () => ({
  requireAdminSession: jest.fn().mockResolvedValue({ user: { email: 'admin@test.com' }, error: null }),
}))
jest.mock('@/lib/private-sales', () => ({
  releaseExpiredSales: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: mockSelect,
    })),
    rpc: mockRpc,
  })),
}))

beforeEach(() => {
  jest.clearAllMocks()
  // Default: products query returns active product
  mockSelect.mockReturnThis()
  mockIn.mockResolvedValue({ data: [{ id: 'p1', is_active: true }], error: null })
  mockEq.mockReturnThis()
  mockMaybeSingle.mockResolvedValue({ data: null, error: null })
  mockRange.mockResolvedValue({ data: [], error: null, count: 0 })
  mockOrder.mockReturnValue({ range: mockRange })
  // RPC default: create_private_sale success
  mockRpc.mockResolvedValue({
    data: { id: 'sale1', token: 'token-uuid', expires_at: new Date(Date.now() + 86400000).toISOString() },
    error: null,
  })
  // Wire the chain
  mockSelect.mockReturnValue({ in: mockIn, eq: mockEq, order: mockOrder })
  mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle })
})

describe('POST /api/admin/private-sales', () => {
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
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com'
    const { POST } = await import('@/app/api/admin/private-sales/route')
    const req = new Request('http://localhost/api/admin/private-sales', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1, customPrice: 45 }], expiresIn: '7d' }),
    })
    expect((await POST(req)).status).toBe(201)
  })
})

describe('DELETE /api/admin/private-sales/[id]', () => {
  it('returns 404 when sale not found', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null })
    const { DELETE } = await import('@/app/api/admin/private-sales/[id]/route')
    const req = new Request('http://localhost/api/admin/private-sales/sale1', { method: 'DELETE' })
    expect((await DELETE(req, { params: Promise.resolve({ id: 'sale1' }) })).status).toBe(404)
  })

  it('returns 409 when sale is already used', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'sale1', used_at: new Date().toISOString(), revoked_at: null }, error: null })
    const { DELETE } = await import('@/app/api/admin/private-sales/[id]/route')
    const req = new Request('http://localhost/api/admin/private-sales/sale1', { method: 'DELETE' })
    expect((await DELETE(req, { params: Promise.resolve({ id: 'sale1' }) })).status).toBe(409)
  })

  it('returns 200 on successful revoke', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { id: 'sale1', used_at: null, revoked_at: null }, error: null })
    mockRpc.mockResolvedValue({ data: null, error: null })
    const { DELETE } = await import('@/app/api/admin/private-sales/[id]/route')
    const req = new Request('http://localhost/api/admin/private-sales/sale1', { method: 'DELETE' })
    expect((await DELETE(req, { params: Promise.resolve({ id: 'sale1' }) })).status).toBe(200)
  })
})
