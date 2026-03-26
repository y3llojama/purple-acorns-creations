/** @jest-environment node */

jest.mock('@/lib/auth', () => ({ requireAdminSession: jest.fn().mockResolvedValue({ error: null }) }))
jest.mock('@/lib/channels', () => ({ syncCategory: jest.fn().mockResolvedValue(undefined) }))

const mockFrom = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({ from: mockFrom })),
}))

function makeChain(resolvedValue: unknown) {
  const chain: Record<string, jest.Mock> = {}
  const methods = ['select','insert','update','delete','upsert','eq','neq','is','order','limit','single','gte','lte']
  methods.forEach(m => { chain[m] = jest.fn().mockReturnValue(chain) })
  chain['single'] = jest.fn().mockResolvedValue(resolvedValue)
  // Make the chain itself thenable so any sequence of chained calls can be awaited
  chain['then'] = jest.fn().mockImplementation((r: (v: unknown) => unknown) => Promise.resolve(resolvedValue).then(r))
  chain['catch'] = jest.fn().mockImplementation(() => Promise.resolve(resolvedValue))
  return chain
}

describe('POST /api/admin/categories', () => {
  beforeEach(() => jest.resetModules())

  it('rejects missing name', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: null }))
    const { POST } = await import('@/app/api/admin/categories/route')
    const req = new Request('http://localhost/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect((await POST(req)).status).toBe(400)
  })

    expect((await POST(req)).status).toBe(400)
  })
})

describe('DELETE /api/admin/categories/[id]', () => {
  beforeEach(() => jest.resetModules())

  it('blocks delete when products are assigned', async () => {
    // Mock: product count = 2
    mockFrom.mockImplementation((table: string) => {
      if (table === 'products') return makeChain({ count: 2, data: [{ name: 'Ring A' }, { name: 'Ring B' }], error: null })
      if (table === 'gallery') return makeChain({ count: 0, data: [], error: null })
      return makeChain({ data: null, error: null })
    })
    const { DELETE } = await import('@/app/api/admin/categories/[id]/route')
    const req = new Request('http://localhost/api/admin/categories/cat-1', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'cat-1' }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.productCount).toBe(2)
  })
})
