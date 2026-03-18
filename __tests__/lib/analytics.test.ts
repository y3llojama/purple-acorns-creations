import { hashIp, parseDeviceType, isAllowedEventType, periodToDate } from '@/lib/analytics'

describe('analytics helpers', () => {
  describe('hashIp', () => {
    it('returns a 16-character hex string', () => {
      const hash = hashIp('192.168.1.1')
      expect(hash).toMatch(/^[0-9a-f]{16}$/)
    })

    it('returns the same hash for the same IP on the same day', () => {
      expect(hashIp('10.0.0.1')).toBe(hashIp('10.0.0.1'))
    })

    it('returns different hashes for different IPs', () => {
      expect(hashIp('10.0.0.1')).not.toBe(hashIp('10.0.0.2'))
    })
  })

  describe('parseDeviceType', () => {
    it('returns desktop for null user-agent', () => {
      expect(parseDeviceType(null)).toBe('desktop')
    })

    it('detects mobile (iPhone)', () => {
      expect(parseDeviceType('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)')).toBe('mobile')
    })

    it('detects mobile (Android mobile)', () => {
      expect(parseDeviceType('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Mobile Safari/537.36')).toBe('mobile')
    })

    it('detects tablet (iPad)', () => {
      expect(parseDeviceType('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)')).toBe('tablet')
    })

    it('returns desktop for Chrome on Windows', () => {
      expect(parseDeviceType('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/112.0.0.0')).toBe('desktop')
    })
  })

  describe('isAllowedEventType', () => {
    it('accepts page_view', () => expect(isAllowedEventType('page_view')).toBe(true))
    it('accepts contact_submit', () => expect(isAllowedEventType('contact_submit')).toBe(true))
    it('accepts newsletter_subscribe', () => expect(isAllowedEventType('newsletter_subscribe')).toBe(true))
    it('accepts shop_click', () => expect(isAllowedEventType('shop_click')).toBe(true))
    it('rejects arbitrary strings', () => expect(isAllowedEventType('xss_attack')).toBe(false))
    it('rejects empty string', () => expect(isAllowedEventType('')).toBe(false))
  })

  describe('periodToDate', () => {
    it('returns a date 7 days ago for "7d"', () => {
      const result = periodToDate('7d')
      const expected = new Date()
      expected.setDate(expected.getDate() - 7)
      expected.setHours(0, 0, 0, 0)
      expect(result.getTime()).toBe(expected.getTime())
    })

    it('returns a date 1 day ago for "1d"', () => {
      const result = periodToDate('1d')
      const expected = new Date()
      expected.setDate(expected.getDate() - 1)
      expected.setHours(0, 0, 0, 0)
      expect(result.getTime()).toBe(expected.getTime())
    })

    it('returns epoch for "all"', () => {
      const result = periodToDate('all')
      expect(result.getTime()).toBe(0)
    })

    it('returns epoch for invalid period', () => {
      const result = periodToDate('xyz')
      expect(result.getTime()).toBe(0)
    })
  })
})
