/**
 * @jest-environment node
 */
jest.mock('@/lib/auth', () => ({ requireAdminSession: jest.fn().mockResolvedValue({ error: null }) }))
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(), insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(), delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'p1', name: 'Test Ring', price: 45, category_id: 'cat-uuid-1', stock_count: 3, images: [], is_active: true, gallery_featured: false }, error: null }),
    })),
  })),
}))
jest.mock('@/lib/channels', () => ({ syncProduct: jest.fn().mockResolvedValue([]) }))

describe('POST /api/admin/inventory', () => {
  it('rejects missing name', async () => {
    const { POST } = await import('@/app/api/admin/inventory/route')
    const req = new Request('http://localhost/api/admin/inventory', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price: 45, category: 'rings' }),
    })
    expect((await POST(req)).status).toBe(400)
  })

  it('accepts product without category_id', async () => {
    const { POST } = await import('@/app/api/admin/inventory/route')
    const req = new Request('http://localhost/api/admin/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ring', price: 45 }),
    })
    expect((await POST(req)).status).toBe(201)
  })
})
