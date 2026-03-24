/**
 * @jest-environment node
 */
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  requireAdminSession: jest.fn().mockResolvedValue({ error: null }),
}))

describe('settings route — hero fields', () => {
  beforeEach(() => jest.resetModules())

  it('rejects invalid hero_transition value', async () => {
    jest.doMock('@/lib/supabase/server', () => ({
      createServiceRoleClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'row-1' }, error: null }),
        })),
      })),
    }))

    const { POST } = await import('@/app/api/admin/settings/route')
    const req = new Request('http://localhost/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hero_transition: 'zoom' }),
    })
    expect((await POST(req)).status).toBe(400)
  })

  it('stores hero_interval_ms as an integer', async () => {
    let capturedUpdate: Record<string, unknown> | null = null
    jest.doMock('@/lib/supabase/server', () => ({
      createServiceRoleClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          update: jest.fn((payload) => {
            capturedUpdate = payload
            return {
              eq: jest.fn().mockResolvedValue({ data: null, error: null }),
            }
          }),
          limit: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: { id: 'row-1' }, error: null }),
        })),
      })),
    }))

    const { POST } = await import('@/app/api/admin/settings/route')
    const req = new Request('http://localhost/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hero_interval_ms: 7000 }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(capturedUpdate).toBeDefined()
    expect(typeof capturedUpdate!.hero_interval_ms).toBe('number')
    expect(capturedUpdate!.hero_interval_ms).toBe(7000)
  })
})
