/**
 * @jest-environment node
 */
jest.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: jest.fn() }))
import { createServiceRoleClient } from '@/lib/supabase/server'
import crypto from 'crypto'

// Resend/Svix uses "whsec_<base64>" format for webhook secrets
const WEBHOOK_SECRET = `whsec_${Buffer.from('test-secret-bytes-for-testing').toString('base64')}`

function makeSvixSignature(secret: string, svixId: string, svixTimestamp: string, body: string): string {
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const toSign = `${svixId}.${svixTimestamp}.${body}`
  const sig = crypto.createHmac('sha256', secretBytes).update(toSign).digest('base64')
  return `v1,${sig}`
}

describe('newsletter webhook authentication', () => {
  const originalEnv = process.env.RESEND_WEBHOOK_SECRET

  beforeEach(() => {
    process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET
  })

  afterEach(() => {
    jest.clearAllMocks()
    if (originalEnv === undefined) delete process.env.RESEND_WEBHOOK_SECRET
    else process.env.RESEND_WEBHOOK_SECRET = originalEnv
  })

  it('returns 500 when RESEND_WEBHOOK_SECRET is not set', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET
    jest.resetModules()
    const { POST } = await import('@/app/api/newsletter/webhook/route')
    const req = new Request('http://localhost/api/newsletter/webhook', {
      method: 'POST',
      headers: { 'x-forwarded-for': '10.0.0.1' },
      body: JSON.stringify({ type: 'email.bounced', data: { email_id: 'abc', to: 'x@example.com' } }),
    })
    expect((await POST(req)).status).toBe(500)
  })

  it('returns 401 when svix headers are missing', async () => {
    jest.resetModules()
    const { POST } = await import('@/app/api/newsletter/webhook/route')
    const req = new Request('http://localhost/api/newsletter/webhook', {
      method: 'POST',
      headers: { 'x-forwarded-for': '10.0.0.2' },
      body: JSON.stringify({ type: 'email.bounced', data: { email_id: 'abc', to: 'x@example.com' } }),
    })
    expect((await POST(req)).status).toBe(401)
  })

  it('returns 401 when svix-signature is invalid', async () => {
    jest.resetModules()
    const { POST } = await import('@/app/api/newsletter/webhook/route')
    const req = new Request('http://localhost/api/newsletter/webhook', {
      method: 'POST',
      headers: {
        'svix-id': 'msg_test',
        'svix-timestamp': String(Math.floor(Date.now() / 1000)),
        'svix-signature': 'v1,invalidsignature==',
        'x-forwarded-for': '10.0.0.3',
      },
      body: JSON.stringify({ type: 'email.bounced', data: { email_id: 'abc', to: 'x@example.com' } }),
    })
    expect((await POST(req)).status).toBe(401)
  })

  it('passes with a valid svix signature', async () => {
    jest.resetModules()
    // Re-mock after resetModules so the freshly imported route picks up the mock
    jest.mock('@/lib/supabase/server', () => ({
      createServiceRoleClient: jest.fn(() => ({
        from: jest.fn(() => ({
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ error: null }),
        })),
      })),
    }))
    const { POST } = await import('@/app/api/newsletter/webhook/route')
    const body = JSON.stringify({ type: 'email.bounced', data: { email_id: 'abc', to: 'x@example.com' } })
    const svixId = 'msg_test_valid'
    const svixTimestamp = String(Math.floor(Date.now() / 1000))
    const signature = makeSvixSignature(WEBHOOK_SECRET, svixId, svixTimestamp, body)
    const req = new Request('http://localhost/api/newsletter/webhook', {
      method: 'POST',
      headers: {
        'svix-id': svixId,
        'svix-timestamp': svixTimestamp,
        'svix-signature': signature,
        'x-forwarded-for': '10.0.0.4',
      },
      body,
    })
    const res = await POST(req)
    // Should not be 401 or 500 — signature verified successfully
    expect(res.status).not.toBe(401)
    expect(res.status).not.toBe(500)
  })
})
