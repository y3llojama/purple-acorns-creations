/** @jest-environment node */
jest.mock('@/lib/auth', () => ({ requireAdminSession: jest.fn().mockResolvedValue({ error: null }) }))
jest.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: jest.fn() }))

import { createServiceRoleClient } from '@/lib/supabase/server'

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000'

function makeChain(resolvedValue: unknown) {
  const chain: Record<string, jest.Mock> = {}
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'order', 'limit', 'single']
  methods.forEach(m => { chain[m] = jest.fn().mockReturnValue(chain) })
  chain['single'] = jest.fn().mockResolvedValue(resolvedValue)
  chain['eq'] = jest.fn().mockResolvedValue(resolvedValue)
  return chain
}

beforeEach(() => jest.clearAllMocks())

describe('PUT /api/admin/events — UUID validation', () => {
  it('returns 400 when id is not a UUID', async () => {
    const { PUT } = await import('@/app/api/admin/events/route')
    const req = new Request('http://localhost/api/admin/events', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'not-a-uuid', name: 'Test' }),
    })
    const res = await PUT(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when id is empty string', async () => {
    const { PUT } = await import('@/app/api/admin/events/route')
    const req = new Request('http://localhost/api/admin/events', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: '', name: 'Test' }),
    })
    const res = await PUT(req)
    expect(res.status).toBe(400)
  })

  it('returns 200 when id is a valid UUID', async () => {
    const chain = makeChain({ data: null, error: null })
    ;(createServiceRoleClient as jest.Mock).mockReturnValue({ from: () => chain })
    const { PUT } = await import('@/app/api/admin/events/route')
    const req = new Request('http://localhost/api/admin/events', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: VALID_UUID, name: 'Updated Event' }),
    })
    const res = await PUT(req)
    expect(res.status).toBe(200)
  })
})

describe('DELETE /api/admin/events — UUID validation', () => {
  it('returns 400 when id is not a UUID', async () => {
    const { DELETE } = await import('@/app/api/admin/events/route')
    const req = new Request('http://localhost/api/admin/events', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'not-a-uuid' }),
    })
    const res = await DELETE(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when id is empty string', async () => {
    const { DELETE } = await import('@/app/api/admin/events/route')
    const req = new Request('http://localhost/api/admin/events', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: '' }),
    })
    const res = await DELETE(req)
    expect(res.status).toBe(400)
  })
})
