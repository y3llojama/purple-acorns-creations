/**
 * @jest-environment node
 */
jest.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: jest.fn() }))
import { createServiceRoleClient } from '@/lib/supabase/server'
import { POST } from '@/app/api/newsletter/webhook/route'
import crypto from 'crypto'

// Resend/Svix uses "whsec_<base64>" format
const WEBHOOK_SECRET = `whsec_${Buffer.from('test-secret-bytes-for-testing').toString('base64')}`
process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET

let msgCounter = 0
let ipCounter = 0

function makeSvixSignature(secret: string, svixId: string, svixTimestamp: string, body: string): string {
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const toSign = `${svixId}.${svixTimestamp}.${body}`
  return `v1,${crypto.createHmac('sha256', secretBytes).update(toSign).digest('base64')}`
}

function req(body: unknown, ip?: string, headers?: Record<string, string>) {
  const bodyStr = JSON.stringify(body)
  const svixId = `msg_${++msgCounter}`
  const svixTimestamp = String(Math.floor(Date.now() / 1000))
  const signature = makeSvixSignature(WEBHOOK_SECRET, svixId, svixTimestamp, bodyStr)

  return new Request('http://localhost/api/newsletter/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip ?? `10.0.0.${++ipCounter}`,
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': signature,
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
    const bodyStr = JSON.stringify({ type: 'email.bounced', data: { email_id: 'abc', to: 'x@example.com' } })
    const invalidReq = new Request('http://localhost/api/newsletter/webhook', {
      method: 'POST',
      headers: {
        'svix-id': 'msg_bad',
        'svix-timestamp': String(Math.floor(Date.now() / 1000)),
        'svix-signature': 'v1,invalidsignature==',
        'x-forwarded-for': '10.0.0.99',
      },
      body: bodyStr,
    })
    const res = await POST(invalidReq)
    expect(res.status).toBe(401)
  })
})
