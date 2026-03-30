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

describe('POST /api/admin/inventory — variation creation (R16/R17)', () => {
  it('creates a default product_variations row when creating a product', async () => {
    const fromCalls: string[] = []
    const { createServiceRoleClient } = require('@/lib/supabase/server')
    createServiceRoleClient.mockReturnValueOnce({
      from: jest.fn((table: string) => {
        fromCalls.push(table)
        return {
          select: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          update: jest.fn().mockReturnThis(),
          delete: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          ilike: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { id: 'p-new', name: 'New Ring', price: 50 },
            error: null,
          }),
        }
      }),
    })

    const { POST } = await import('@/app/api/admin/inventory/route')
    const req = new Request('http://localhost/api/admin/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Ring', price: 50, stock_count: 5 }),
    })
    await POST(req)
    expect(fromCalls).toContain('product_variations')
  })
})
