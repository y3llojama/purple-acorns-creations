/**
 * @jest-environment node
 */
jest.mock('@/lib/auth', () => ({
  requireAdminSession: jest.fn().mockResolvedValue({ error: null }),
}))

describe('GET /api/admin/messages/unread-count', () => {
  beforeEach(() => jest.resetModules())

  it('returns count of unread messages', async () => {
    jest.doMock('@/lib/supabase/server', () => ({
      createServiceRoleClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ count: 3, error: null }),
        })),
      })),
    }))
    const { GET } = await import('@/app/api/admin/messages/unread-count/route')
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ count: 3 })
  })

  it('returns 0 when no unread messages', async () => {
    jest.doMock('@/lib/supabase/server', () => ({
      createServiceRoleClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ count: 0, error: null }),
        })),
      })),
    }))
    const { GET } = await import('@/app/api/admin/messages/unread-count/route')
    const res = await GET()
    expect(await res.json()).toEqual({ count: 0 })
  })

  it('returns 0 when count is null (empty table)', async () => {
    jest.doMock('@/lib/supabase/server', () => ({
      createServiceRoleClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ count: null, error: null }),
        })),
      })),
    }))
    const { GET } = await import('@/app/api/admin/messages/unread-count/route')
    const res = await GET()
    expect(await res.json()).toEqual({ count: 0 })
  })

  it('returns 401 when not authenticated', async () => {
    jest.resetModules()
    jest.doMock('@/lib/auth', () => ({
      requireAdminSession: jest.fn().mockResolvedValue({
        error: new Response(null, { status: 401 }),
      }),
    }))
    jest.doMock('@/lib/supabase/server', () => ({
      createServiceRoleClient: jest.fn(),
    }))
    const { GET } = await import('@/app/api/admin/messages/unread-count/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 500 on database error', async () => {
    jest.doMock('@/lib/supabase/server', () => ({
      createServiceRoleClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockResolvedValue({ count: null, error: { message: 'db error' } }),
        })),
      })),
    }))
    const { GET } = await import('@/app/api/admin/messages/unread-count/route')
    const res = await GET()
    expect(res.status).toBe(500)
  })
})
