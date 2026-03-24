/** @jest-environment node */

jest.mock('@/lib/auth', () => ({ requireAdminSession: jest.fn().mockResolvedValue({ error: null }) }))

const mockFrom = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({ from: mockFrom })),
}))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

function makeChain(resolvedValue: unknown) {
  const chain: Record<string, jest.Mock> = {}
  const methods = ['select','insert','update','delete','eq','order','limit','single']
  methods.forEach(m => { chain[m] = jest.fn().mockReturnValue(chain) })
  chain['single'] = jest.fn().mockResolvedValue(resolvedValue)
  chain['then'] = jest.fn().mockImplementation((r: (v: unknown) => unknown) => Promise.resolve(resolvedValue).then(r))
  chain['catch'] = jest.fn().mockImplementation(() => Promise.resolve(resolvedValue))
  return chain
}

const { requireAdminSession } = require('@/lib/auth') as { requireAdminSession: jest.Mock }

describe('GET /api/admin/hero-slides', () => {
  beforeEach(() => jest.clearAllMocks())

  it('rejects unauthenticated request', async () => {
    requireAdminSession.mockResolvedValueOnce({ error: new Response(null, { status: 401 }) })
    const { GET } = await import('@/app/api/admin/hero-slides/route')
    const req = new Request('http://localhost/api/admin/hero-slides')
    expect((await GET(req)).status).toBe(401)
  })

  it('returns slides ordered by sort_order', async () => {
    const slides = [
      { id: 'aaa', url: 'https://example.com/a.jpg', alt_text: 'A', sort_order: 0 },
      { id: 'bbb', url: 'https://example.com/b.jpg', alt_text: 'B', sort_order: 1 },
    ]
    mockFrom.mockReturnValue(makeChain({ data: slides, error: null }))
    const { GET } = await import('@/app/api/admin/hero-slides/route')
    const req = new Request('http://localhost/api/admin/hero-slides')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual(slides)
  })
})

describe('POST /api/admin/hero-slides', () => {
  beforeEach(() => jest.clearAllMocks())

  it('rejects unauthenticated request', async () => {
    requireAdminSession.mockResolvedValueOnce({ error: new Response(null, { status: 401 }) })
    const { POST } = await import('@/app/api/admin/hero-slides/route')
    const req = new Request('http://localhost/api/admin/hero-slides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/a.jpg', alt_text: 'A' }),
    })
    expect((await POST(req)).status).toBe(401)
  })

  it('rejects invalid URL', async () => {
    const { POST } = await import('@/app/api/admin/hero-slides/route')
    const req = new Request('http://localhost/api/admin/hero-slides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'not-a-url', alt_text: 'A' }),
    })
    expect((await POST(req)).status).toBe(400)
  })

  it('rejects missing alt_text', async () => {
    const { POST } = await import('@/app/api/admin/hero-slides/route')
    const req = new Request('http://localhost/api/admin/hero-slides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/a.jpg' }),
    })
    expect((await POST(req)).status).toBe(400)
  })

  it('returns 201 and calls revalidatePath on success', async () => {
    const slide = { id: 'aaa', url: 'https://example.com/a.jpg', alt_text: 'A', sort_order: 0 }
    mockFrom.mockReturnValue(makeChain({ data: slide, error: null }))
    const { revalidatePath } = require('next/cache') as { revalidatePath: jest.Mock }
    const { POST } = await import('@/app/api/admin/hero-slides/route')
    const req = new Request('http://localhost/api/admin/hero-slides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/a.jpg', alt_text: 'A', sort_order: 0 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })
})
