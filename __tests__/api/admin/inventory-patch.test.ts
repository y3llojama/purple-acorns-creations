/**
 * @jest-environment node
 */
jest.mock('@/lib/auth', () => ({ requireAdminSession: jest.fn().mockResolvedValue({ error: null }) }))

const mockFrom = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
  })),
}))
jest.mock('@/lib/channels', () => ({ syncProduct: jest.fn().mockResolvedValue([]) }))

function makeBuilder(value: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) => resolve(value),
  }
}

describe('PATCH /api/admin/inventory/[id]', () => {
  let PATCH: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>

  beforeAll(async () => {
    const module = await import('@/app/api/admin/inventory/[id]/route')
    PATCH = module.PATCH
  })

  beforeEach(() => {
    jest.resetAllMocks()
    // Re-set mocks after resetAllMocks clears their implementations
    const { requireAdminSession } = jest.requireMock('@/lib/auth') as { requireAdminSession: jest.Mock }
    requireAdminSession.mockResolvedValue({ error: null })
    const { createServiceRoleClient } = jest.requireMock('@/lib/supabase/server') as { createServiceRoleClient: jest.Mock }
    createServiceRoleClient.mockReturnValue({ from: (...args: unknown[]) => mockFrom(...args) })
    const { syncProduct } = jest.requireMock('@/lib/channels') as { syncProduct: jest.Mock }
    syncProduct.mockResolvedValue([])
  })

  it('writes price/stock to product_variations, not products table (R8)', async () => {
    const fromCalls: string[] = []
    mockFrom.mockImplementation((table: string) => {
      fromCalls.push(table)
      if (table === 'product_variations') return makeBuilder({
        data: { id: 'v1', product_id: 'p1', price: 50, stock_count: 10, updated_at: '2026-01-01T00:00:00Z' },
        error: null,
      })
      return makeBuilder({ data: { id: 'p1' }, error: null })
    })

    const req = new Request('http://localhost/api/admin/inventory/p1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variationId: 'v1',
        price: 55,
        stock_count: 8,
        updated_at: '2026-01-01T00:00:00Z',
      }),
    })

    await PATCH(req, { params: Promise.resolve({ id: 'p1' }) })
    expect(fromCalls).toContain('product_variations')
  })

  it('returns 409 when updated_at does not match (optimistic lock)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'product_variations') return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) => resolve({
          data: { id: 'v1', updated_at: '2026-01-02T00:00:00Z' },
          error: null,
        }),
      }
      return makeBuilder({ data: null, error: null })
    })

    const req = new Request('http://localhost/api/admin/inventory/p1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variationId: 'v1',
        price: 55,
        updated_at: '2026-01-01T00:00:00Z',
      }),
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1' }) })
    expect(res.status).toBe(409)
  })
})
