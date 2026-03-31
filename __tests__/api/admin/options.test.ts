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

function makeBuilder(value: unknown) {
  return {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) => resolve(value),
  }
}

describe('GET /api/admin/options', () => {
  let GET: (req: Request) => Promise<Response>
  beforeAll(async () => {
    const mod = await import('@/app/api/admin/options/route')
    GET = mod.GET
  })
  beforeEach(() => {
    jest.resetAllMocks()
    const { requireAdminSession } = jest.requireMock('@/lib/auth') as { requireAdminSession: jest.Mock }
    requireAdminSession.mockResolvedValue({ error: null })
    const { createServiceRoleClient } = jest.requireMock('@/lib/supabase/server') as { createServiceRoleClient: jest.Mock }
    createServiceRoleClient.mockReturnValue({ from: (...args: unknown[]) => mockFrom(...args) })
  })

  it('returns reusable options with their values', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'item_options') return makeBuilder({
        data: [{ id: 'o1', name: 'Size', values: [{ id: 'v1', name: 'S' }] }],
        error: null,
      })
      return makeBuilder({ data: [], error: null })
    })
    const res = await GET(new Request('http://localhost/api/admin/options'))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/admin/options', () => {
  let POST: (req: Request) => Promise<Response>
  beforeAll(async () => {
    const mod = await import('@/app/api/admin/options/route')
    POST = mod.POST
  })
  beforeEach(() => {
    jest.resetAllMocks()
    const { requireAdminSession } = jest.requireMock('@/lib/auth') as { requireAdminSession: jest.Mock }
    requireAdminSession.mockResolvedValue({ error: null })
    const { createServiceRoleClient } = jest.requireMock('@/lib/supabase/server') as { createServiceRoleClient: jest.Mock }
    createServiceRoleClient.mockReturnValue({ from: (...args: unknown[]) => mockFrom(...args) })
  })

  it('sanitizes option name before insert', async () => {
    const insertMock = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => void) => resolve({ data: { id: 'o1', name: 'Size' }, error: null }),
    })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'item_options') return { insert: insertMock }
      return makeBuilder({ data: null, error: null })
    })
    const req = new Request('http://localhost/api/admin/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '<script>alert("xss")</script>Size' }),
    })
    await POST(req)
    expect(insertMock).toHaveBeenCalled()
    const insertArg = insertMock.mock.calls[0][0]
    expect(insertArg.name).not.toContain('<script>')
  })

  it('rejects empty name', async () => {
    const req = new Request('http://localhost/api/admin/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
