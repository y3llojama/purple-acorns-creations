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

function mockSettings(keys: { mailchimp_api_key?: string; mailchimp_audience_id?: string } | null) {
  const mockSingle = jest.fn().mockResolvedValue({ data: keys })
  const mockSelect = jest.fn().mockReturnValue({ single: mockSingle })
  ;(createServiceRoleClient as jest.Mock).mockReturnValue({ from: () => ({ select: mockSelect }) })
}

it('400 for invalid email', async () => {
  const res = await POST(req({ email: 'notanemail' }))
  expect(res.status).toBe(400)
})

it('200 when mailchimp accepts subscriber', async () => {
  mockSettings({ mailchimp_api_key: 'testkey-us1', mailchimp_audience_id: 'list123' })
  global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response)
  const res = await POST(req({ email: 'test@example.com' }))
  expect(res.status).toBe(200)
})

it('503 when mailchimp not configured', async () => {
  mockSettings(null)
  const res = await POST(req({ email: 'test@example.com' }))
  expect(res.status).toBe(503)
})
