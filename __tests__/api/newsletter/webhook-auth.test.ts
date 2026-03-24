/**
 * @jest-environment node
 */
jest.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: jest.fn() }))
import { createServiceRoleClient } from '@/lib/supabase/server'
import { POST } from '@/app/api/newsletter/webhook/route'
import crypto from 'crypto'

const WEBHOOK_SECRET = 'test-webhook-secret-for-testing'
process.env.RESEND_WEBHOOK_SECRET = WEBHOOK_SECRET

describe('newsletter webhook authentication', () => {
  const originalEnv = process.env.RESEND_WEBHOOK_SECRET

  afterEach(() => {
    jest.clearAllMocks()
    if (originalEnv === undefined) delete process.env.RESEND_WEBHOOK_SECRET
    else process.env.RESEND_WEBHOOK_SECRET = originalEnv
  })

  it('returns 500 when RESEND_WEBHOOK_SECRET is not set', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET
    // Reload module to pick up missing env var
    jest.resetModules()
    const { POST: POSTReloaded } = await import('@/app/api/newsletter/webhook/route')
    const req = new Request('http://localhost/api/newsletter/webhook', {
      method: 'POST',
      headers: { 'x-forwarded-for': '10.0.0.1' },
      body: JSON.stringify({ type: 'email.bounced', data: { email_id: 'abc', to: 'x@example.com' } }),
    })
    const res = await POSTReloaded(req)
    expect(res.status).toBe(500)
  })

  it('returns 401 when signature is invalid', async () => {
    const req = new Request('http://localhost/api/newsletter/webhook', {
      method: 'POST',
      headers: {
        'svix-signature': 't=12345,v1=badsignature',
        'x-forwarded-for': '10.0.0.99',
      },
      body: JSON.stringify({ type: 'email.bounced', data: { email_id: 'abc', to: 'x@example.com' } }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})
