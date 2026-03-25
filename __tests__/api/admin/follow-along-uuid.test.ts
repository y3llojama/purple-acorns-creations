/** @jest-environment node */
jest.mock('@/lib/auth', () => ({ requireAdminSession: jest.fn().mockResolvedValue({ error: null }) }))
jest.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: jest.fn() }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

beforeEach(() => jest.clearAllMocks())

describe('PATCH /api/admin/follow-along — UUID validation', () => {
  it('returns 400 when id is not a UUID', async () => {
    const { PATCH } = await import('@/app/api/admin/follow-along/route')
    const req = new Request('http://localhost/api/admin/follow-along', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'not-a-uuid', display_order: 1 }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when id is empty string', async () => {
    const { PATCH } = await import('@/app/api/admin/follow-along/route')
    const req = new Request('http://localhost/api/admin/follow-along', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: '', display_order: 1 }),
    })
    const res = await PATCH(req)
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/admin/follow-along — UUID validation', () => {
  it('returns 400 when id is not a UUID', async () => {
    const { DELETE } = await import('@/app/api/admin/follow-along/route')
    const req = new Request('http://localhost/api/admin/follow-along', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'not-a-uuid' }),
    })
    const res = await DELETE(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when id is empty string', async () => {
    const { DELETE } = await import('@/app/api/admin/follow-along/route')
    const req = new Request('http://localhost/api/admin/follow-along', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: '' }),
    })
    const res = await DELETE(req)
    expect(res.status).toBe(400)
  })
})
