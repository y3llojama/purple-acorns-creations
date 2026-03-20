import { generateSlug, isValidNewsletterSection, buildAiPrompt } from '@/lib/newsletter'

describe('generateSlug', () => {
  it('lowercases and hyphenates', () => {
    expect(generateSlug('Spring Collection', '2026-03')).toBe('2026-03-spring-collection')
  })
  it('strips punctuation', () => {
    expect(generateSlug("What's New!", '2026-03')).toBe('2026-03-whats-new')
  })
  it('collapses multiple hyphens', () => {
    expect(generateSlug('Hello   World', '2026-03')).toBe('2026-03-hello-world')
  })
})

describe('isValidNewsletterSection', () => {
  it('accepts text section', () => {
    expect(isValidNewsletterSection({ type: 'text', body: '<p>hi</p>' })).toBe(true)
  })
  it('accepts cta with https url', () => {
    expect(isValidNewsletterSection({ type: 'cta', label: 'Shop', url: 'https://example.com' })).toBe(true)
  })
  it('rejects cta with http url', () => {
    expect(isValidNewsletterSection({ type: 'cta', label: 'Shop', url: 'http://example.com' })).toBe(false)
  })
  it('accepts image with https url', () => {
    expect(isValidNewsletterSection({ type: 'image', image_url: 'https://example.com/img.jpg' })).toBe(true)
  })
  it('rejects image with http url', () => {
    expect(isValidNewsletterSection({ type: 'image', image_url: 'http://example.com/img.jpg' })).toBe(false)
  })
  it('rejects unknown type', () => {
    expect(isValidNewsletterSection({ type: 'script', body: 'bad' } as any)).toBe(false)
  })
})

describe('buildAiPrompt', () => {
  it('includes tone, working_on, and date', () => {
    const p = buildAiPrompt({ workingOn: 'new rings', selectedChips: ['spring'], tone: 'excited', extra: '', upcomingEvents: [], today: '2026-03-19' })
    expect(p).toContain('excited')
    expect(p).toContain('new rings')
    expect(p).toContain('2026-03-19')
  })
})
