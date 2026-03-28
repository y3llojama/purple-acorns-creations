/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/theme', () => ({
  getSettings: jest.fn().mockResolvedValue({ gallery_watermark: null, business_name: 'Test' })
}))

jest.mock('@/lib/get-client-ip', () => ({
  getClientIp: jest.fn().mockReturnValue('127.0.0.1')
}))

// Mock fetch to return a tiny valid image
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
beforeAll(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    arrayBuffer: () => Promise.resolve(PIXEL.buffer),
  }) as unknown as typeof fetch
})

afterAll(() => { jest.restoreAllMocks() })

describe('watermark proxy cache headers', () => {
  it('returns aggressive cache headers on success', async () => {
    const { GET } = await import('@/app/api/gallery/image/route')
    const req = new NextRequest('http://localhost/api/gallery/image?url=https://abc.supabase.co/storage/v1/object/public/products/test.jpg')
    const res = await GET(req)
    const cc = res.headers.get('Cache-Control')
    expect(cc).toBe('public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600')
  })
})
