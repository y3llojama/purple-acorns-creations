/**
 * @jest-environment node
 */
jest.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: jest.fn() }))
import { createServiceRoleClient } from '@/lib/supabase/server'
import { POST } from '@/app/api/newsletter/webhook/route'

let ipCounter = 0
function req(body: unknown, ip?: string) {
  return new Request('http://localhost/api/newsletter/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip ?? `10.0.0.${++ipCounter}`,
    },
    body: JSON.stringify(body),
  })
}
beforeEach(() => jest.clearAllMocks())

it('400 for missing email_id', async () => {
  const res = await POST(req({ type: 'email.opened', data: {} }))
  expect(res.status).toBe(400)
})

it('200 and updates opened_at on email.opened', async () => {
  const mockEq = jest.fn().mockResolvedValue({ error: null })
  const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq })
  ;(createServiceRoleClient as jest.Mock).mockReturnValue({ from: () => ({ update: mockUpdate }) })
  const res = await POST(req({ type: 'email.opened', data: { email_id: 'msg_123' } }))
  expect(res.status).toBe(200)
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ opened_at: expect.any(String) }))
})
