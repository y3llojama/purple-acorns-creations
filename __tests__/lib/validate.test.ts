import { isValidEmail, isValidHttpsUrl, clampLength } from '@/lib/validate'

describe('isValidEmail', () => {
  it('accepts valid email', () => expect(isValidEmail('test@example.com')).toBe(true))
  it('rejects missing @', () => expect(isValidEmail('notanemail')).toBe(false))
  it('rejects empty string', () => expect(isValidEmail('')).toBe(false))
})

describe('isValidHttpsUrl', () => {
  it('accepts https URL', () => expect(isValidHttpsUrl('https://example.com')).toBe(true))
  it('rejects http URL', () => expect(isValidHttpsUrl('http://example.com')).toBe(false))
  it('rejects javascript scheme', () => expect(isValidHttpsUrl('javascript:alert(1)')).toBe(false))
  it('rejects empty string', () => expect(isValidHttpsUrl('')).toBe(false))
})

describe('clampLength', () => {
  it('truncates long strings', () => expect(clampLength('hello', 3)).toBe('hel'))
  it('leaves short strings unchanged', () => expect(clampLength('hi', 10)).toBe('hi'))
})
