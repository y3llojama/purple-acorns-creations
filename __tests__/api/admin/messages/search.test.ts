/** @jest-environment node */

jest.mock('@/lib/auth', () => ({ requireAdminSession: jest.fn().mockResolvedValue({ error: null }) }))

const mockOr = jest.fn()
const mockFrom = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({ from: mockFrom })),
}))

beforeEach(() => {
  jest.clearAllMocks()

  // Build a chainable query that captures .or() args and resolves at .range()
  const chain: Record<string, jest.Mock> = {}
  const methods = ['select', 'gt', 'eq', 'order', 'range']
  methods.forEach(m => { chain[m] = jest.fn().mockReturnValue(chain) })
  chain['or'] = mockOr.mockReturnValue(chain)
  chain['range'] = jest.fn().mockResolvedValue({ data: [], count: 0, error: null })
  mockFrom.mockReturnValue(chain)
})

describe('GET /api/admin/messages search injection resistance', () => {
  it('strips commas from q before passing to .or()', async () => {
    const { GET } = await import('@/app/api/admin/messages/route')
    const req = new Request('http://localhost/api/admin/messages?q=hello%2Cworld')
    await GET(req)

    expect(mockOr).toHaveBeenCalled()
    const orArg: string = mockOr.mock.calls[0][0]
    // The injected comma must have been stripped: 'hello,world' -> 'helloworld'
    // The raw input 'hello,world' (with literal comma between the words) must not appear
    expect(orArg).not.toContain('hello,world')
    // The cleaned term 'helloworld' (comma removed) should be interpolated
    expect(orArg).toContain('helloworld')
  })

  it('strips parentheses from q before passing to .or()', async () => {
    const { GET } = await import('@/app/api/admin/messages/route')
    const req = new Request('http://localhost/api/admin/messages?q=foo(bar)')
    await GET(req)

    expect(mockOr).toHaveBeenCalled()
    const orArg: string = mockOr.mock.calls[0][0]
    expect(orArg).not.toContain('(bar)')
    expect(orArg).not.toContain(')')
    expect(orArg).toContain('foobar')
  })

  it('does not call .or() when q is empty', async () => {
    const { GET } = await import('@/app/api/admin/messages/route')
    const req = new Request('http://localhost/api/admin/messages?q=')
    await GET(req)
    expect(mockOr).not.toHaveBeenCalled()
  })

  it('does not call .or() when q contains only stripped characters', async () => {
    const { GET } = await import('@/app/api/admin/messages/route')
    const req = new Request('http://localhost/api/admin/messages?q=%2C%28%29')
    await GET(req)
    // After stripping ,()  the safeQ is empty — .or() must not be called
    expect(mockOr).not.toHaveBeenCalled()
  })

  it('preserves dots in q so email address searches work', async () => {
    const { GET } = await import('@/app/api/admin/messages/route')
    const req = new Request('http://localhost/api/admin/messages?q=user@example.com')
    await GET(req)

    expect(mockOr).toHaveBeenCalled()
    const orArg: string = mockOr.mock.calls[0][0]
    // Dot must be preserved so email search works
    expect(orArg).toContain('user@example.com')
  })
})
