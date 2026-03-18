import { isValidHttpsUrl, isValidEmail, clampLength } from '@/lib/validate'

describe('Admin API input validation', () => {
  it('rejects javascript: links in event link_url', () => {
    expect(isValidHttpsUrl('javascript:void(0)')).toBe(false)
  })
  it('accepts valid https event link', () => {
    expect(isValidHttpsUrl('https://eventbrite.com/event/123')).toBe(true)
  })
  it('clamps alt text to 500 chars', () => {
    expect(clampLength('a'.repeat(600), 500).length).toBe(500)
  })
  it('rejects invalid admin contact email', () => {
    expect(isValidEmail('notanemail')).toBe(false)
  })
  it('accepts valid admin contact email', () => {
    expect(isValidEmail('admin@purpleacorns.com')).toBe(true)
  })
})
