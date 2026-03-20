/**
 * @jest-environment node
 */
jest.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: jest.fn() }))
import { createServiceRoleClient } from '@/lib/supabase/server'
import { POST } from '@/app/api/newsletter/subscribe/route'

let testIpCounter = 0
function req(body: unknown) {
  // Use a unique IP per call so the in-memory rate-limit map never blocks a test
  const ip = `10.0.0.${++testIpCounter}`
  return new Request('http://localhost/api/newsletter/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
}
beforeEach(() => jest.clearAllMocks())

it('400 for invalid email', async () => {
  const res = await POST(req({ email: 'notanemail' }))
  expect(res.status).toBe(400)
})

it('200 and upserts subscriber', async () => {
  const mockUpsert = jest.fn().mockResolvedValue({ error: null })
  ;(createServiceRoleClient as jest.Mock).mockReturnValue({ from: () => ({ upsert: mockUpsert }) })
  const res = await POST(req({ email: 'test@example.com' }))
  expect(res.status).toBe(200)
  expect(mockUpsert).toHaveBeenCalledWith(
    expect.objectContaining({ email: 'test@example.com', status: 'active', source: 'public_signup' }),
    expect.objectContaining({ onConflict: 'email' })
  )
})

it('500 on DB error', async () => {
  const mockUpsert = jest.fn().mockResolvedValue({ error: { message: 'DB failure' } })
  ;(createServiceRoleClient as jest.Mock).mockReturnValue({ from: () => ({ upsert: mockUpsert }) })
  const res = await POST(req({ email: 'error@example.com' }))
  expect(res.status).toBe(500)
})
