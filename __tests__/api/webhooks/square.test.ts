/**
 * @jest-environment node
 */
import { verifySquareSignature } from '@/lib/channels/square/webhook'
import { createHmac } from 'crypto'

const WEBHOOK_KEY = 'test-webhook-key'
const WEBHOOK_URL = 'https://example.com/api/webhooks/square'

function makeSignature(url: string, body: string): string {
  return createHmac('sha256', WEBHOOK_KEY).update(url + body).digest('base64')
}

// ── verifySquareSignature unit tests ────────────────────────────────────────

describe('verifySquareSignature', () => {
  it('returns true for valid signature', () => {
    const body = JSON.stringify({ type: 'inventory.count.updated' })
    const sig = makeSignature(WEBHOOK_URL, body)
    expect(verifySquareSignature(WEBHOOK_URL, body, sig, WEBHOOK_KEY)).toBe(true)
  })

  it('returns false for tampered body', () => {
    const body = JSON.stringify({ type: 'inventory.count.updated' })
    const sig = makeSignature(WEBHOOK_URL, body)
    expect(verifySquareSignature(WEBHOOK_URL, body + 'x', sig, WEBHOOK_KEY)).toBe(false)
  })

  it('returns false for wrong key', () => {
    const body = JSON.stringify({ type: 'test' })
    const sig = makeSignature(WEBHOOK_URL, body)
    expect(verifySquareSignature(WEBHOOK_URL, body, sig, 'wrong-key')).toBe(false)
  })
})

// ── POST /api/webhooks/square route handler tests ───────────────────────────

const mockHandleInventoryUpdate = jest.fn()
const mockHandleCatalogConflict = jest.fn()

jest.mock('@/lib/channels/square/webhook', () => ({
  verifySquareSignature: jest.requireActual('@/lib/channels/square/webhook').verifySquareSignature,
  handleInventoryUpdate: (...args: unknown[]) => mockHandleInventoryUpdate(...args),
  handleCatalogConflict: (...args: unknown[]) => mockHandleCatalogConflict(...args),
}))

const ENV_KEY = 'test-route-key'
const ENV_URL = 'https://example.com/api/webhooks/square'

function makeWebhookRequest(body: string, sig?: string, ip = '1.2.3.4') {
  const signature = sig ?? createHmac('sha256', ENV_KEY).update(ENV_URL + body).digest('base64')
  return new Request('https://example.com/api/webhooks/square', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-square-hmacsha256-signature': signature,
      'x-real-ip': ip,
    },
    body,
  })
}

describe('POST /api/webhooks/square', () => {
  let POST: (req: Request) => Promise<Response>
  const origKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
  const origUrl = process.env.SQUARE_WEBHOOK_URL

  beforeAll(async () => {
    const module = await import('@/app/api/webhooks/square/route')
    POST = module.POST
  })

  beforeEach(() => {
    jest.resetAllMocks()
    process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = ENV_KEY
    process.env.SQUARE_WEBHOOK_URL = ENV_URL
  })

  afterAll(() => {
    process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = origKey
    process.env.SQUARE_WEBHOOK_URL = origUrl
  })

  it('returns 500 when SQUARE_WEBHOOK_SIGNATURE_KEY is not configured', async () => {
    delete process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
    const res = await POST(makeWebhookRequest('{}'))
    expect(res.status).toBe(500)
  })

  it('returns 401 for invalid signature', async () => {
    const body = JSON.stringify({ type: 'inventory.count.updated' })
    const res = await POST(makeWebhookRequest(body, 'bad-signature'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid JSON body', async () => {
    const body = 'not-json'
    const sig = createHmac('sha256', ENV_KEY).update(ENV_URL + body).digest('base64')
    const res = await POST(makeWebhookRequest(body, sig))
    expect(res.status).toBe(400)
  })

  it('calls handleInventoryUpdate and returns 200 for inventory.count.updated', async () => {
    mockHandleInventoryUpdate.mockResolvedValue(undefined)
    const body = JSON.stringify({ type: 'inventory.count.updated', data: { object: { inventory_counts: [] } } })
    const res = await POST(makeWebhookRequest(body))
    expect(res.status).toBe(200)
    expect(mockHandleInventoryUpdate).toHaveBeenCalledTimes(1)
    expect(mockHandleCatalogConflict).not.toHaveBeenCalled()
  })

  it('calls handleCatalogConflict and returns 200 for catalog.version.updated', async () => {
    mockHandleCatalogConflict.mockResolvedValue(undefined)
    const body = JSON.stringify({ type: 'catalog.version.updated', data: { ids: ['cat1'] } })
    const res = await POST(makeWebhookRequest(body))
    expect(res.status).toBe(200)
    expect(mockHandleCatalogConflict).toHaveBeenCalledTimes(1)
    expect(mockHandleInventoryUpdate).not.toHaveBeenCalled()
  })

  it('returns 200 and ignores unknown event types', async () => {
    const body = JSON.stringify({ type: 'some.unknown.event' })
    const res = await POST(makeWebhookRequest(body))
    expect(res.status).toBe(200)
    expect(mockHandleInventoryUpdate).not.toHaveBeenCalled()
    expect(mockHandleCatalogConflict).not.toHaveBeenCalled()
  })

  it('returns 429 after exceeding 120 requests per IP', async () => {
    const ip = 'webhook-ratelimit-test'
    const body = JSON.stringify({ type: 'test' })
    const req = () => makeWebhookRequest(body, undefined, ip)
    for (let i = 0; i < 120; i++) await POST(req())
    expect((await POST(req())).status).toBe(429)
  })
})

// ── handleInventoryUpdate write-target tests ─────────────────────────────────

describe('handleInventoryUpdate — write target', () => {
  const mockFromHandler = jest.fn()
  const mockInsert = jest.fn()

  beforeEach(() => {
    jest.resetAllMocks()
    mockInsert.mockReturnValue({
      then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
    })
  })

  it('writes stock update to product_variations, not products', async () => {
    // Dynamic import to get fresh module with our mocks
    jest.resetModules()
    jest.unmock('@/lib/channels/square/webhook')
    jest.doMock('@/lib/supabase/server', () => ({
      createServiceRoleClient: () => ({
        from: (...args: unknown[]) => mockFromHandler(...args),
      }),
    }))

    const { handleInventoryUpdate } = await import('@/lib/channels/square/webhook')

    const updateBuilder = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
    }

    mockFromHandler.mockImplementation((table: string) => {
      if (table === 'product_variations') return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'v1', product_id: 'p1', stock_count: 5 },
        }),
        ...updateBuilder,
      }
      if (table === 'stock_movements') return { insert: mockInsert }
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() }
    })

    await handleInventoryUpdate({
      data: { object: { inventory_counts: [
        { catalog_object_id: 'sq-var-1', quantity: '8' },
      ] } },
    })

    const fromCalls = mockFromHandler.mock.calls.map((c: unknown[]) => c[0])
    expect(fromCalls).toContain('product_variations')
    expect(fromCalls).not.toContain('products')
  })

  it('creates stock_movements entry on inventory webhook', async () => {
    jest.resetModules()
    jest.unmock('@/lib/channels/square/webhook')
    jest.doMock('@/lib/supabase/server', () => ({
      createServiceRoleClient: () => ({
        from: (...args: unknown[]) => mockFromHandler(...args),
      }),
    }))

    const { handleInventoryUpdate } = await import('@/lib/channels/square/webhook')

    mockFromHandler.mockImplementation((table: string) => {
      if (table === 'product_variations') return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: { id: 'v1', product_id: 'p1', stock_count: 5 },
        }),
        update: jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
      }
      if (table === 'stock_movements') return { insert: mockInsert }
      return { select: jest.fn().mockReturnThis() }
    })

    await handleInventoryUpdate({
      data: { object: { inventory_counts: [
        { catalog_object_id: 'sq-var-1', quantity: '8' },
      ] } },
    })

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        variation_id: 'v1',
        reason: 'sync_correction',
        source: 'square',
      }),
    )
  })
})
