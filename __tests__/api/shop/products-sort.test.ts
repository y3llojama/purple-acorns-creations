/**
 * @jest-environment node
 */

const mockFrom = jest.fn()
jest.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}))

describe('GET /api/shop/products — price sort (R10)', () => {
  let GET: (req: Request) => Promise<Response>

  beforeAll(async () => {
    const module = await import('@/app/api/shop/products/route')
    GET = module.GET
  })

  beforeEach(() => jest.resetAllMocks())

  it('queries products_with_default view, not products table', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => void) => resolve({
        data: [],
        error: null,
        count: 0,
      }),
    })

    const req = new Request('http://localhost/api/shop/products?sort=price_asc')
    await GET(req)
    expect(mockFrom).toHaveBeenCalledWith('products_with_default')
  })

  it('sorts by effective_price, not products.price', async () => {
    const mockOrder = jest.fn().mockReturnThis()
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: mockOrder,
      range: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => void) => resolve({
        data: [],
        error: null,
        count: 0,
      }),
    })

    const req = new Request('http://localhost/api/shop/products?sort=price_asc')
    await GET(req)
    expect(mockOrder).toHaveBeenCalledWith('effective_price', expect.objectContaining({ ascending: true }))
  })
})
