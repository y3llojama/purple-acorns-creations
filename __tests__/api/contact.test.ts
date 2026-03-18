import { isValidEmail, clampLength } from '@/lib/validate'
import { sanitizeText } from '@/lib/sanitize'

describe('Contact form validation', () => {
  it('rejects empty email', () => expect(isValidEmail('')).toBe(false))
  it('rejects malformed email', () => expect(isValidEmail('notanemail')).toBe(false))
  it('clamps name to 100 chars', () => expect(clampLength('a'.repeat(200), 100).length).toBe(100))
  it('clamps message to 2000 chars', () => expect(clampLength('x'.repeat(3000), 2000).length).toBe(2000))
  it('sanitizes HTML from name field', () => expect(sanitizeText('<script>alert(1)</script>')).toBe(''))
  it('sanitizes HTML from message field', () => expect(sanitizeText('<img onerror="alert(1)">')).toBe(''))
})
