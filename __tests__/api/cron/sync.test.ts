/**
 * @jest-environment node
 */

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
})
