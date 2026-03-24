/**
 * @jest-environment node
 */
jest.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: jest.fn() }))
import { createServiceRoleClient } from '@/lib/supabase/server'
import { POST } from '@/app/api/newsletter/webhook/route'
import crypto from 'crypto'

const WEBHOOK_SECRET = 'test-webhook-secret-for-testing'
process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET

let ipCounter = 0
function req(body: unknown, ip?: string, headers?: Record<string, string>) {
  const bodyStr = JSON.stringify(body)
  const timestamp = '1234567890'
  const signature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.${bodyStr}`)
    .digest('hex')

  return new Request('http://localhost/api/newsletter/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip ?? `10.0.0.${++ipCounter}`,
      'svix-signature': `t=${timestamp},v1=${signature}`,
      ...headers,
    },
    body: bodyStr,
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

describe('webhook authentication', () => {
  it('returns 401 when signature is invalid', async () => {
    const invalidReq = new Request('http://localhost/api/newsletter/webhook', {
      method: 'POST',
      headers: {
        'svix-signature': 't=12345,v1=badsignature',
        'x-forwarded-for': '10.0.0.99',
      },
      body: JSON.stringify({ type: 'email.bounced', data: { email_id: 'abc', to: 'x@example.com' } }),
    })
    const res = await POST(invalidReq)
    expect(res.status).toBe(401)
  })
})
