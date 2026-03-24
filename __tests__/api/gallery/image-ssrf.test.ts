/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/theme', () => ({
  getSettings: jest.fn().mockResolvedValue({ gallery_watermark: null })
}))

jest.mock('@/lib/get-client-ip', () => ({
  getClientIp: jest.fn().mockReturnValue('127.0.0.1')
}))

describe('gallery image proxy SSRF protection', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  it('rejects AWS metadata endpoint', async () => {
    const { GET } = await import('@/app/api/gallery/image/route')
    const req = new NextRequest('http://localhost/api/gallery/image?url=https://169.254.169.254/latest/meta-data/')
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/not allowed/i)
  })

  it('rejects attacker-controlled domains', async () => {
    const { GET } = await import('@/app/api/gallery/image/route')
    const req = new NextRequest('http://localhost/api/gallery/image?url=https://evil.com/malware.jpg')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('isImageUrlAllowed accepts supabase.co subdomains', async () => {
    const { isImageUrlAllowed } = await import('@/app/api/gallery/image/route')
    expect(isImageUrlAllowed('https://abc123.supabase.co/storage/v1/object/public/gallery/img.jpg')).toBe(true)
  })

  it('isImageUrlAllowed rejects supabase.co lookalikes', async () => {
    const { isImageUrlAllowed } = await import('@/app/api/gallery/image/route')
    expect(isImageUrlAllowed('https://evil-supabase.co/image.jpg')).toBe(false)
    expect(isImageUrlAllowed('https://supabase.co.evil.com/image.jpg')).toBe(false)
  })
})
