import { sanitizeContent, sanitizeText } from '@/lib/sanitize'

describe('sanitizeContent', () => {
  it('allows safe HTML tags', () => {
    const result = sanitizeContent('<p>Hello <strong>world</strong></p>')
    expect(result).toBe('<p>Hello <strong>world</strong></p>')
  })
  it('strips script tags', () => {
    const result = sanitizeContent('<p>Safe</p><script>alert("xss")</script>')
    expect(result).not.toContain('<script>')
    expect(result).toContain('<p>Safe</p>')
  })
  it('strips inline event handlers', () => {
    const result = sanitizeContent('<p onclick="alert(1)">Click me</p>')
    expect(result).not.toContain('onclick')
  })
  it('strips javascript: links', () => {
    const result = sanitizeContent('<a href="javascript:alert(1)">Click</a>')
    expect(result).not.toContain('javascript:')
  })
  it('allows safe href links', () => {
    const result = sanitizeContent('<a href="https://example.com">Link</a>')
    expect(result).toContain('href="https://example.com"')
  })
})

describe('sanitizeText', () => {
  it('strips all HTML', () => {
    expect(sanitizeText('<b>bold</b>')).toBe('bold')
  })
  it('returns plain text unchanged', () => {
    expect(sanitizeText('Hello world')).toBe('Hello world')
  })
})
