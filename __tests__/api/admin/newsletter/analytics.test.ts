/**
 * @jest-environment node
 */
jest.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: jest.fn() }))
jest.mock('@/lib/auth', () => ({ requireAdminSession: jest.fn() }))
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { GET } from '@/app/api/admin/newsletter/[id]/analytics/route'

const params = Promise.resolve({ id: 'nl-1' })
function req() {
  return new Request('http://localhost/api/admin/newsletter/nl-1/analytics')
}
beforeEach(() => {
  jest.clearAllMocks()
  ;(requireAdminSession as jest.Mock).mockResolvedValue({ error: null })
})

it('404 when newsletter not found', async () => {
  ;(createServiceRoleClient as jest.Mock).mockReturnValue({
    from: () => ({
      select: () => ({ eq: () => ({ single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }) }) }),
    }),
  })
  const res = await GET(req(), { params })
  expect(res.status).toBe(404)
})

it('200 with computed stats', async () => {
  const mockClient = {
    from: jest.fn(),
  }
  // newsletter fetch
  mockClient.from.mockReturnValueOnce({
    select: () => ({ eq: () => ({ single: jest.fn().mockResolvedValue({ data: { slug: 'june-2025', sent_at: '2025-06-01T10:00:00Z' }, error: null }) }) }),
  })
  // newsletter_send_log
  mockClient.from.mockReturnValueOnce({
    select: () => ({ eq: jest.fn().mockResolvedValue({ data: [
      { status: 'sent', opened_at: '2025-06-01T11:00:00Z', clicked_at: null },
      { status: 'sent', opened_at: null, clicked_at: null },
      { status: 'failed', opened_at: null, clicked_at: null },
    ], error: null }) }),
  })
  // analytics_events page views
  mockClient.from.mockReturnValueOnce({
    select: () => ({ eq: jest.fn().mockResolvedValue({ count: 42, error: null }) }),
  })
  // analytics_events UTM
  mockClient.from.mockReturnValueOnce({
    select: () => ({ filter: jest.fn().mockResolvedValue({ count: 10, error: null }) }),
  })
  // unsubscribes
  mockClient.from.mockReturnValueOnce({
    select: () => ({
      eq: () => ({ gte: () => ({ lte: jest.fn().mockResolvedValue({ count: 1, error: null }) }) }),
    }),
  })
  ;(createServiceRoleClient as jest.Mock).mockReturnValue(mockClient)

  const res = await GET(req(), { params })
  expect(res.status).toBe(200)
  const data = await res.json()
  expect(data.sent_count).toBe(2)        // only 'sent' status rows
  expect(data.open_rate).toBeCloseTo(0.5) // 1 opened of 2 sent
  expect(data.click_rate).toBe(0)
  expect(data.page_views).toBe(42)
})
