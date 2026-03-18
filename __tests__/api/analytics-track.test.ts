/**
 * Tests for the analytics tracking API route validation logic.
 * We test the shared helpers since the route handler depends on
 * Next.js request/response objects that are hard to mock in unit tests.
 */
import { isAllowedEventType, parseDeviceType, hashIp } from '@/lib/analytics'
import { clampLength } from '@/lib/validate'

describe('Analytics track API validation', () => {
  it('rejects unknown event types', () => {
    expect(isAllowedEventType('malicious_event')).toBe(false)
    expect(isAllowedEventType('DROP TABLE')).toBe(false)
    expect(isAllowedEventType('<script>')).toBe(false)
  })

  it('accepts all known event types', () => {
    expect(isAllowedEventType('page_view')).toBe(true)
    expect(isAllowedEventType('contact_submit')).toBe(true)
    expect(isAllowedEventType('newsletter_subscribe')).toBe(true)
    expect(isAllowedEventType('shop_click')).toBe(true)
  })

  it('clamps page_path length', () => {
    const longPath = '/products/' + 'a'.repeat(1000)
    expect(clampLength(longPath, 500).length).toBe(500)
  })

  it('hashes IP without storing raw value', () => {
    const raw = '203.0.113.42'
    const hashed = hashIp(raw)
    expect(hashed).not.toContain('203')
    expect(hashed).not.toContain('113')
    expect(hashed).toMatch(/^[0-9a-f]{16}$/)
  })

  it('extracts device type from user-agent', () => {
    expect(parseDeviceType('Mozilla/5.0 (iPhone; CPU iPhone OS)')).toBe('mobile')
    expect(parseDeviceType('Mozilla/5.0 (iPad; CPU OS)')).toBe('tablet')
    expect(parseDeviceType('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('desktop')
  })
})
