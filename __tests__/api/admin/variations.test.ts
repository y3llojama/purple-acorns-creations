/**
 * @jest-environment node
 */
jest.mock('@/lib/auth', () => ({ requireAdminSession: jest.fn().mockResolvedValue({ error: null }) }))

const mockFrom = jest.fn()
const mockRpc = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  })),
}))
jest.mock('@/lib/channels', () => ({ syncProduct: jest.fn().mockResolvedValue([]) }))

function makePutRequest(productId: string, body: unknown) {
  return new Request(`http://localhost/api/admin/inventory/${productId}/variations`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validPayload = {
  options: [
    { name: 'Size', values: [{ name: 'Small' }, { name: 'Large' }] },
  ],
  variations: [
    { option_values: { Size: 'Small' }, price: 25, sku: 'RING-SM', stock_count: 5 },
    { option_values: { Size: 'Large' }, price: 30, sku: 'RING-LG', stock_count: 3 },
  ],
}

describe('PUT /api/admin/inventory/[id]/variations', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    const { requireAdminSession } = jest.requireMock('@/lib/auth') as { requireAdminSession: jest.Mock }
    requireAdminSession.mockResolvedValue({ error: null })
    mockRpc.mockResolvedValue({ data: { variations: [] }, error: null })
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 'p1', name: 'Test' }, error: null }),
    })
    const { createServiceRoleClient } = jest.requireMock('@/lib/supabase/server') as { createServiceRoleClient: jest.Mock }
    createServiceRoleClient.mockReturnValue({
      from: (...args: unknown[]) => mockFrom(...args),
      rpc: (...args: unknown[]) => mockRpc(...args),
    })
    const { syncProduct } = jest.requireMock('@/lib/channels') as { syncProduct: jest.Mock }
    syncProduct.mockResolvedValue([])
  })

  it('calls replace_product_variations RPC with sanitized payload', async () => {
    const { PUT } = await import('@/app/api/admin/inventory/[id]/variations/route')
    const payload = {
      options: [
        { name: '<b>Size</b>', values: [{ name: '<script>alert("x")</script>Small' }] },
      ],
      variations: [
        { option_values: { Size: 'Small' }, price: 25, sku: 'RING-SM' },
      ],
    }
    const req = makePutRequest('p1', payload)
    await PUT(req, { params: Promise.resolve({ id: 'p1' }) })

    expect(mockRpc).toHaveBeenCalledWith('replace_product_variations', expect.anything())
    const rpcArgs = mockRpc.mock.calls[0][1]
    const options = JSON.parse(rpcArgs.p_options)
    // Option name should not contain HTML tags
    expect(options[0].name).not.toContain('<b>')
    expect(options[0].name).not.toContain('<script>')
  })

  it('rejects payload with > 3 options (400)', async () => {
    const { PUT } = await import('@/app/api/admin/inventory/[id]/variations/route')
    const payload = {
      options: [
        { name: 'Size', values: [{ name: 'S' }] },
        { name: 'Color', values: [{ name: 'Red' }] },
        { name: 'Material', values: [{ name: 'Gold' }] },
        { name: 'Finish', values: [{ name: 'Matte' }] },
      ],
      variations: [
        { option_values: { Size: 'S' }, price: 10, sku: 'X' },
      ],
    }
    const req = makePutRequest('p1', payload)
    const res = await PUT(req, { params: Promise.resolve({ id: 'p1' }) })
    expect(res.status).toBe(400)
  })

  it('rejects variation with price <= 0 (400)', async () => {
    const { PUT } = await import('@/app/api/admin/inventory/[id]/variations/route')
    const payload = {
      options: [{ name: 'Size', values: [{ name: 'S' }] }],
      variations: [
        { option_values: { Size: 'S' }, price: 0, sku: 'RING-S' },
      ],
    }
    const req = makePutRequest('p1', payload)
    const res = await PUT(req, { params: Promise.resolve({ id: 'p1' }) })
    expect(res.status).toBe(400)
  })

  it('does not include stock_count in RPC payload (amendment A1)', async () => {
    const { PUT } = await import('@/app/api/admin/inventory/[id]/variations/route')
    const req = makePutRequest('p1', validPayload)
    await PUT(req, { params: Promise.resolve({ id: 'p1' }) })

    expect(mockRpc).toHaveBeenCalled()
    const rpcArgs = mockRpc.mock.calls[0][1]
    const variations = JSON.parse(rpcArgs.p_variations)
    for (const v of variations) {
      expect(v).not.toHaveProperty('stock_count')
    }
  })

  it('validates SKU format — rejects HTML/script in SKU (400)', async () => {
    const { PUT } = await import('@/app/api/admin/inventory/[id]/variations/route')
    const payload = {
      options: [{ name: 'Size', values: [{ name: 'S' }] }],
      variations: [
        { option_values: { Size: 'S' }, price: 25, sku: '<script>alert(1)</script>' },
      ],
    }
    const req = makePutRequest('p1', payload)
    const res = await PUT(req, { params: Promise.resolve({ id: 'p1' }) })
    expect(res.status).toBe(400)
  })
})
