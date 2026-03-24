/**
 * @jest-environment node
 */
jest.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: jest.fn() }))
import { createServiceRoleClient } from '@/lib/supabase/server'
import { POST } from '@/app/api/newsletter/unsubscribe/route'

let testIpCounter = 0
function req(body: unknown) {
  const ip = `10.1.0.${++testIpCounter}`
  return new Request('http://localhost/api/newsletter/unsubscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
}
beforeEach(() => jest.clearAllMocks())

// Valid token: 48-char hex string (matches gen_random_bytes(24) encoded as hex)
const VALID_TOKEN = 'a'.repeat(48)
const FAIL_TOKEN  = 'b'.repeat(48)

it('400 when token is missing', async () => {
  const res = await POST(req({}))
  expect(res.status).toBe(400)
})

it('400 when token has invalid format', async () => {
  const res = await POST(req({ token: 'invalid-token' }))
  expect(res.status).toBe(400)
})

it('200 on successful unsubscribe', async () => {
  const mockEq2 = jest.fn().mockResolvedValue({ error: null })
  const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 })
  const mockUpdate = jest.fn().mockReturnValue({ eq: mockEq1 })
  ;(createServiceRoleClient as jest.Mock).mockReturnValue({
    from: () => ({ update: mockUpdate }),
  })
  const res = await POST(req({ token: VALID_TOKEN }))
  expect(res.status).toBe(200)
  expect(mockUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'unsubscribed' })
  )
})

it('500 on DB error', async () => {
  const mockEq2 = jest.fn().mockResolvedValue({ error: { message: 'DB failure' } })
  const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 })
  ;(createServiceRoleClient as jest.Mock).mockReturnValue({
    from: () => ({ update: () => ({ eq: mockEq1 }) }),
  })
  const res = await POST(req({ token: FAIL_TOKEN }))
  expect(res.status).toBe(500)
})
