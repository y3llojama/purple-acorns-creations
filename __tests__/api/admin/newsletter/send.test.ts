/**
 * @jest-environment node
 */
jest.mock('@/lib/auth', () => ({ requireAdminSession: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: jest.fn() }))
jest.mock('@/lib/resend', () => ({
  getResendClient: jest.fn(),
  buildNewsletterEmail: jest.fn().mockReturnValue('<html></html>'),
  sendNewsletterBatch: jest.fn().mockResolvedValue({ sent: 0, failed: 0, messageIds: {} }),
}))
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { POST } from '@/app/api/admin/newsletter/[id]/send/route'

function req(body: unknown) {
  return new Request('http://localhost/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}
const ctx = { params: Promise.resolve({ id: 'abc' }) }

beforeEach(() => {
  jest.clearAllMocks()
  ;(requireAdminSession as jest.Mock).mockResolvedValue({ user: { email: 'a@b.com' }, error: null })
})

it('400 when confirmation wrong', async () => {
  const res = await POST(req({ confirmation: 'SEND' }), ctx)
  expect(res.status).toBe(400)
})

it('400 when scheduled_at missing', async () => {
  const res = await POST(req({ confirmation: 'SEND NEWSLETTER' }), ctx)
  expect(res.status).toBe(400)
})

it('503 when resend not configured', async () => {
  const mockSettings = { resend_api_key: null, newsletter_from_email: null }
  ;(createServiceRoleClient as jest.Mock).mockReturnValue({
    from: (table: string) => ({
      select: () => ({
        single: jest.fn().mockResolvedValue(
          table === 'settings'
            ? { data: mockSettings, error: null }
            : { data: { id: 'abc', status: 'draft', title: 'Test' }, error: null }
        ),
        eq: () => ({ single: jest.fn().mockResolvedValue({ data: { id: 'abc', status: 'draft', title: 'Test' }, error: null }) }),
        count: jest.fn().mockResolvedValue({ count: 0, error: null }),
      }),
    }),
  })
  const future = new Date(Date.now() + 86400000 * 2).toISOString()
  const res = await POST(req({ confirmation: 'SEND NEWSLETTER', scheduled_at: future }), ctx)
  expect(res.status).toBe(503)
})
