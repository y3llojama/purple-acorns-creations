import { watermarkSrc, djb2Hash } from '@/lib/image-url'

describe('djb2Hash', () => {
  it('returns an 8-char hex string', () => {
    const hash = djb2Hash('Purple Acorns Creations')
    expect(hash).toMatch(/^[0-9a-f]{8}$/)
  })

  it('returns different hashes for different inputs', () => {
    expect(djb2Hash('foo')).not.toBe(djb2Hash('bar'))
  })

  it('returns the same hash for the same input', () => {
    expect(djb2Hash('test')).toBe(djb2Hash('test'))
  })
})

describe('watermarkSrc', () => {
  it('builds proxy URL with encoded image URL and wm hash', () => {
    const url = watermarkSrc('https://abc.supabase.co/storage/v1/object/public/products/img.jpg', 'My Brand')
    expect(url).toContain('/api/gallery/image?')
    expect(url).toContain('url=https%3A%2F%2Fabc.supabase.co')
    expect(url).toContain('wm=')
    expect(url).not.toContain('v=')
  })

  it('includes version param when provided', () => {
    const url = watermarkSrc('https://abc.supabase.co/storage/v1/object/public/products/img.jpg', 'My Brand', '2026-03-28T12:00:00Z')
    expect(url).toContain('v=2026-03-28T12')
  })

  it('omits version param when undefined', () => {
    const url = watermarkSrc('https://abc.supabase.co/storage/v1/object/public/products/img.jpg', 'My Brand')
    expect(url).not.toContain('&v=')
  })
})
