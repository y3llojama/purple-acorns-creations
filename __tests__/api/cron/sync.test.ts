/**
 * @jest-environment node
 */

jest.mock('@/lib/channels', () => ({
  syncAllProducts: jest.fn().mockResolvedValue([]),
}))

jest.mock('@/lib/channels/square/logger', () => ({
  cleanupOldLogs: jest.fn().mockResolvedValue(0),
}))

describe('GET /api/cron/sync', () => {
  it('returns 401 with no Authorization header', async () => {
    const { GET } = await import('@/app/api/cron/sync/route')
    const req = new Request('http://localhost/api/cron/sync')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 401 with wrong secret', async () => {
    const { GET } = await import('@/app/api/cron/sync/route')
    const req = new Request('http://localhost/api/cron/sync', {
      headers: { Authorization: 'Bearer wrong-secret' },
    })
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('queries products for sync (R18 — baseline for migration to products_with_default)', async () => {
    // After migration, syncAllProducts should read from products_with_default view
    // This test documents the current behavior as a baseline
    const { GET } = await import('@/app/api/cron/sync/route')
    const req = new Request('http://localhost/api/cron/sync', {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
  })
})
