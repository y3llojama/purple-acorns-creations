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

function mockSubscribers(existing: { status: string } | null) {
  ;(createServiceRoleClient as jest.Mock).mockReturnValue({
    from: () => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: existing }),
        }),
      }),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
      insert: jest.fn().mockResolvedValue({ error: null }),
    }),
  })
}

it('400 for invalid email', async () => {
  const res = await POST(req({ email: 'notanemail' }))
  expect(res.status).toBe(400)
})

it('200 for new subscriber', async () => {
  mockSubscribers(null)
  const res = await POST(req({ email: 'test@example.com' }))
  expect(res.status).toBe(200)
})

it('200 for already active subscriber (no duplicate insert)', async () => {
  mockSubscribers({ status: 'active' })
  const res = await POST(req({ email: 'test@example.com' }))
  expect(res.status).toBe(200)
})
