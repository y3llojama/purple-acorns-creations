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
  chain['order'] = jest.fn().mockResolvedValue(resolvedValue)
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
    expect(await res.json()).toEqual(slide)
  })
})

describe('DELETE /api/admin/hero-slides/[id]', () => {
  beforeEach(() => jest.clearAllMocks())

  it('rejects unauthenticated request', async () => {
    requireAdminSession.mockResolvedValueOnce({ error: new Response(null, { status: 401 }) })
    const { DELETE } = await import('@/app/api/admin/hero-slides/[id]/route')
    const req = new Request('http://localhost/api/admin/hero-slides/abc', { method: 'DELETE' })
    expect((await DELETE(req, { params: Promise.resolve({ id: 'abc' }) })).status).toBe(401)
  })

  it('rejects non-UUID id', async () => {
    const { DELETE } = await import('@/app/api/admin/hero-slides/[id]/route')
    const req = new Request('http://localhost/api/admin/hero-slides/not-a-uuid', { method: 'DELETE' })
    expect((await DELETE(req, { params: Promise.resolve({ id: 'not-a-uuid' }) })).status).toBe(400)
  })

  it('deletes slide and calls revalidatePath', async () => {
    const chain = makeChain({ data: null, error: null })
    chain['eq'] = jest.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue(chain)
    const { revalidatePath } = require('next/cache') as { revalidatePath: jest.Mock }
    const { DELETE } = await import('@/app/api/admin/hero-slides/[id]/route')
    const validId = '123e4567-e89b-12d3-a456-426614174000'
    const req = new Request(`http://localhost/api/admin/hero-slides/${validId}`, { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: validId }) })
    expect(res.status).toBe(200)
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })
})

describe('PATCH /api/admin/hero-slides/reorder', () => {
  beforeEach(() => jest.clearAllMocks())

  const validIds = [
    '123e4567-e89b-12d3-a456-426614174000',
    '223e4567-e89b-12d3-a456-426614174001',
  ]

  it('rejects unauthenticated request', async () => {
    requireAdminSession.mockResolvedValueOnce({ error: new Response(null, { status: 401 }) })
    const { PATCH } = await import('@/app/api/admin/hero-slides/reorder/route')
    const req = new Request('http://localhost/api/admin/hero-slides/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: validIds }),
    })
    expect((await PATCH(req)).status).toBe(401)
  })

  it('rejects ids array exceeding 100 elements', async () => {
    const { PATCH } = await import('@/app/api/admin/hero-slides/reorder/route')
    const ids = Array.from({ length: 101 }, (_, i) =>
      `123e4567-e89b-12d3-a456-4266141740${String(i).padStart(2, '0')}`
    )
    const req = new Request('http://localhost/api/admin/hero-slides/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    expect((await PATCH(req)).status).toBe(400)
  })

  it('rejects array containing a non-UUID element', async () => {
    const { PATCH } = await import('@/app/api/admin/hero-slides/reorder/route')
    const req = new Request('http://localhost/api/admin/hero-slides/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['not-a-uuid', validIds[0]] }),
    })
    expect((await PATCH(req)).status).toBe(400)
  })

  it('updates sort_order and calls revalidatePath', async () => {
    const chain = makeChain({ data: null, error: null })
    chain['eq'] = jest.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue(chain)
    const { revalidatePath } = require('next/cache') as { revalidatePath: jest.Mock }
    const { PATCH } = await import('@/app/api/admin/hero-slides/reorder/route')
    const req = new Request('http://localhost/api/admin/hero-slides/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: validIds }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(200)
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('rejects empty ids array', async () => {
    const { PATCH } = await import('@/app/api/admin/hero-slides/reorder/route')
    const req = new Request('http://localhost/api/admin/hero-slides/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [] }),
    })
    expect((await PATCH(req)).status).toBe(400)
  })

  it('rejects missing ids field', async () => {
    const { PATCH } = await import('@/app/api/admin/hero-slides/reorder/route')
    const req = new Request('http://localhost/api/admin/hero-slides/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect((await PATCH(req)).status).toBe(400)
  })
})
