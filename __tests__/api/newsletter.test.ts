import { isValidEmail } from '@/lib/validate'

describe('Newsletter email validation', () => {
  it('accepts valid emails', () => {
    expect(isValidEmail('user@example.com')).toBe(true)
    expect(isValidEmail('user+tag@example.co.uk')).toBe(true)
  })
  it('rejects invalid emails', () => {
    expect(isValidEmail('')).toBe(false)
    expect(isValidEmail('notanemail')).toBe(false)
    expect(isValidEmail('<script>@evil.com')).toBe(false)
  })
})
