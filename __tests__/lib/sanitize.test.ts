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
  it('injects noopener noreferrer and target=_blank on safe links', () => {
    const result = sanitizeContent('<a href="https://example.com">Link</a>')
    expect(result).toContain('rel="noopener noreferrer"')
    expect(result).toContain('target="_blank"')
  })
  it('strips http:// links (https only)', () => {
    const result = sanitizeContent('<a href="http://evil.com">Click</a>')
    expect(result).not.toContain('href="http://evil.com"')
    expect(result).not.toContain('<a ')
  })
  it('strips img onerror XSS', () => {
    const result = sanitizeContent('<img src="x" onerror="alert(1)">')
    expect(result).not.toContain('onerror')
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
