import { sanitizeText } from '@/lib/sanitize'
import { stripControlChars, isValidUuid, isValidEmail, clampLength, validateImageAttachment, MESSAGE_ATTACHMENT_MAX_SIZE } from '@/lib/validate'

describe('Message security — input sanitization', () => {
  describe('XSS prevention', () => {
    it('strips script tags from name', () => {
      expect(sanitizeText('<script>alert("xss")</script>')).toBe('')
    })
    it('strips event handler attributes', () => {
      expect(sanitizeText('<img onerror="alert(1)" src="x">')).toBe('')
    })
    it('strips SVG-based XSS', () => {
      expect(sanitizeText('<svg onload="alert(1)">')).toBe('')
    })
    it('strips nested tags', () => {
      expect(sanitizeText('<div><script>alert(1)</script></div>')).toBe('')
    })
    it('preserves plain text content', () => {
      expect(sanitizeText('Hello, I love your rings!')).toBe('Hello, I love your rings!')
    })
  })

  describe('Email header injection prevention', () => {
    it('strips \\r\\n from name to prevent Bcc injection', () => {
      const result = stripControlChars('Bob\r\nBcc: victim@evil.com')
      expect(result).not.toContain('\r')
      expect(result).not.toContain('\n')
    })
    it('strips \\n from name', () => {
      expect(stripControlChars('Bob\nCc: attacker@evil.com')).toBe('Bob Cc: attacker@evil.com')
    })
    it('strips null bytes', () => {
      expect(stripControlChars('Hello\0World')).toBe('Hello World')
    })
    it('preserves normal text', () => {
      expect(stripControlChars('Jane Doe')).toBe('Jane Doe')
    })
  })

  describe('Email validation rejects injection patterns', () => {
    it('rejects email with angle brackets', () => {
      expect(isValidEmail('user<script>@evil.com')).toBe(false)
    })
    it('rejects email with double quotes', () => {
      expect(isValidEmail('"user@evil.com')).toBe(false)
    })
    it('rejects email with single quotes', () => {
      expect(isValidEmail("user'@evil.com")).toBe(false)
    })
    it('accepts valid email', () => {
      expect(isValidEmail('customer@gmail.com')).toBe(true)
    })
  })

  describe('UUID validation', () => {
    it('accepts valid UUID', () => {
      expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    })
    it('rejects SQL injection in UUID', () => {
      expect(isValidUuid("'; DROP TABLE messages;--")).toBe(false)
    })
    it('rejects empty string', () => {
      expect(isValidUuid('')).toBe(false)
    })
    it('rejects partial UUID', () => {
      expect(isValidUuid('550e8400-e29b')).toBe(false)
    })
  })

  describe('Length clamping prevents DoS-size payloads', () => {
    it('clamps name to 100', () => {
      expect(clampLength('A'.repeat(10000), 100).length).toBe(100)
    })
    it('clamps message to 2000', () => {
      expect(clampLength('B'.repeat(50000), 2000).length).toBe(2000)
    })
    it('clamps reply to 5000', () => {
      expect(clampLength('C'.repeat(100000), 5000).length).toBe(5000)
    })
  })
})

describe('Image attachment validation', () => {
  function makeFile(type: string, size: number): File {
    return new File(['x'.repeat(size)], 'test.jpg', { type })
  }

  it('accepts JPEG under 5MB', () => {
    expect(validateImageAttachment(makeFile('image/jpeg', 100))).toBeNull()
  })
  it('accepts PNG under 5MB', () => {
    expect(validateImageAttachment(makeFile('image/png', 100))).toBeNull()
  })
  it('rejects SVG', () => {
    expect(validateImageAttachment(makeFile('image/svg+xml', 100))).toMatch(/not allowed/)
  })
  it('rejects file over 5MB', () => {
    expect(validateImageAttachment(makeFile('image/jpeg', MESSAGE_ATTACHMENT_MAX_SIZE + 1))).toMatch(/5MB/)
  })
  it('rejects non-image', () => {
    expect(validateImageAttachment(makeFile('application/pdf', 100))).toMatch(/not allowed/)
  })
  it('rejects file with no MIME type', () => {
    expect(validateImageAttachment(makeFile('', 100))).toMatch(/not allowed/)
  })
})
