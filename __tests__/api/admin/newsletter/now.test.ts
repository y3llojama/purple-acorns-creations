/**
 * @jest-environment node
 */
jest.mock('@/lib/auth', () => ({ requireAdminSession: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: jest.fn() }))
jest.mock('@/lib/resend', () => ({
  getResendClient: jest.fn().mockReturnValue({}),
  sendNewsletterBatch: jest.fn().mockResolvedValue({ sent: 3, failed: 0, messageIds: {} }),
}))
jest.mock('@/lib/crypto', () => ({
  decryptSettings: jest.fn((s: unknown) => s),
}))

import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { sendNewsletterBatch } from '@/lib/resend'

const VALID_ID = '123e4567-e89b-12d3-a456-426614174000'

function req(body: unknown, id = VALID_ID) {
  return new Request(`http://localhost/api/admin/newsletter/${id}/now`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeCtx(id = VALID_ID) {
  return { params: Promise.resolve({ id }) }
}

const baseNewsletter = {
  id: VALID_ID,
  status: 'draft',
  title: 'Spring Edition',
  slug: 'spring-edition',
  subject_line: 'New arrivals!',
  teaser_text: '',
  hero_image_url: null,
  content: [],
  tone: 'upbeat',
  ai_brief: null,
  scheduled_at: null,
  sent_at: null,
  created_at: '',
  updated_at: '',
}

const baseSettings = {
  resend_api_key: 'test-key',
  newsletter_from_email: 'hello@purpleacornz.com',
  newsletter_from_name: 'Purple Acorns',
  newsletter_admin_emails: null,
  business_name: 'Purple Acorns Creations',
}

const activeSubscribers = [
  { email: 'a@example.com', unsubscribe_token: 'tok1' },
  { email: 'b@example.com', unsubscribe_token: 'tok2' },
]

function makeSupabaseMock({
  newsletter = { data: baseNewsletter, error: null } as { data: unknown; error: unknown },
  settings = { data: baseSettings, error: null } as { data: unknown; error: unknown },
  subscribers = { data: activeSubscribers, error: null } as { data: unknown; error: unknown },
  updateError = null as unknown,
} = {}) {
  return {
    from: (table: string) => {
      if (table === 'settings') {
        return { select: () => ({ single: jest.fn().mockResolvedValue(settings) }) }
      }
      if (table === 'newsletters') {
        return {
          select: () => ({ eq: () => ({ single: jest.fn().mockResolvedValue(newsletter) }) }),
          update: () => ({ eq: jest.fn().mockResolvedValue({ error: updateError }) }),
        }
      }
      if (table === 'newsletter_subscribers') {
        return { select: () => ({ eq: jest.fn().mockResolvedValue(subscribers) }) }
      }
      return {}
    },
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(requireAdminSession as jest.Mock).mockResolvedValue({ user: { email: 'a@b.com' }, error: null })
  delete process.env.RESEND_API_KEY
  delete process.env.NEWSLETTER_FROM_EMAIL
  delete process.env.NEWSLETTER_FROM_NAME
})

it('400 when confirmation is missing', async () => {
  const { POST } = await import('@/app/api/admin/newsletter/[id]/now/route')
  const res = await POST(req({}), makeCtx())
  expect(res.status).toBe(400)
  const body = await res.json()
  expect(body.error).toMatch(/SEND NEWSLETTER/)
})

it('400 when confirmation is wrong', async () => {
  const { POST } = await import('@/app/api/admin/newsletter/[id]/now/route')
  const res = await POST(req({ confirmation: 'send newsletter' }), makeCtx())
  expect(res.status).toBe(400)
})

it('400 with Invalid newsletter id when id is not a UUID', async () => {
  const { POST } = await import('@/app/api/admin/newsletter/[id]/now/route')
  const res = await POST(req({ confirmation: 'SEND NEWSLETTER' }, 'not-a-uuid'), makeCtx('not-a-uuid'))
  expect(res.status).toBe(400)
  const body = await res.json()
  expect(body.error).toBe('Invalid newsletter id.')
})

it('400 with Invalid newsletter id when id is empty string', async () => {
  const { POST } = await import('@/app/api/admin/newsletter/[id]/now/route')
  const res = await POST(req({ confirmation: 'SEND NEWSLETTER' }, ''), makeCtx(''))
  expect(res.status).toBe(400)
  const body = await res.json()
  expect(body.error).toBe('Invalid newsletter id.')
})

it('404 when newsletter not found (PGRST116)', async () => {
  ;(createServiceRoleClient as jest.Mock).mockReturnValue(
    makeSupabaseMock({ newsletter: { data: null, error: { code: 'PGRST116', message: 'not found' } } })
  )
  const { POST } = await import('@/app/api/admin/newsletter/[id]/now/route')
  const res = await POST(req({ confirmation: 'SEND NEWSLETTER' }), makeCtx())
  expect(res.status).toBe(404)
  const body = await res.json()
  expect(body.error).toBe('Newsletter not found.')
})

it('400 when newsletter already sent', async () => {
  ;(createServiceRoleClient as jest.Mock).mockReturnValue(
    makeSupabaseMock({ newsletter: { data: { ...baseNewsletter, status: 'sent' }, error: null } })
  )
  const { POST } = await import('@/app/api/admin/newsletter/[id]/now/route')
  const res = await POST(req({ confirmation: 'SEND NEWSLETTER' }), makeCtx())
  expect(res.status).toBe(400)
  const body = await res.json()
  expect(body.error).toMatch(/already been sent/)
})

it('503 when Resend is not configured', async () => {
  ;(createServiceRoleClient as jest.Mock).mockReturnValue(
    makeSupabaseMock({
      settings: {
        data: { resend_api_key: null, newsletter_from_email: null, newsletter_from_name: null, newsletter_admin_emails: null, business_name: null },
        error: null,
      },
    })
  )
  const { POST } = await import('@/app/api/admin/newsletter/[id]/now/route')
  const res = await POST(req({ confirmation: 'SEND NEWSLETTER' }), makeCtx())
  expect(res.status).toBe(503)
})

it('400 when there are no active subscribers', async () => {
  ;(createServiceRoleClient as jest.Mock).mockReturnValue(
    makeSupabaseMock({ subscribers: { data: [], error: null } })
  )
  const { POST } = await import('@/app/api/admin/newsletter/[id]/now/route')
  const res = await POST(req({ confirmation: 'SEND NEWSLETTER' }), makeCtx())
  expect(res.status).toBe(400)
  const body = await res.json()
  expect(body.error).toMatch(/No active subscribers/)
})

it('200 with success: true and sent_at on valid request', async () => {
  ;(createServiceRoleClient as jest.Mock).mockReturnValue(makeSupabaseMock())
  const { POST } = await import('@/app/api/admin/newsletter/[id]/now/route')
  const res = await POST(req({ confirmation: 'SEND NEWSLETTER' }), makeCtx())
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.success).toBe(true)
  expect(body.sent_at).toBeDefined()
  expect(sendNewsletterBatch).toHaveBeenCalled()
})
