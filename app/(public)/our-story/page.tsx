// Content is sanitized via markdownToHtml() or sanitizeContent() before rendering.
// dangerouslySetInnerHTML is safe here: all content passes through the allowlist-based sanitizer.
import { getContentWithFormat } from '@/lib/content'
import { sanitizeContent, markdownToHtml } from '@/lib/sanitize'
import { getSettings } from '@/lib/theme'
import { interpolate, buildVars } from '@/lib/variables'

export const metadata = { title: 'Our Story' }

export default async function OurStoryPage() {
  const [{ value, format }, settings] = await Promise.all([
    getContentWithFormat('story_full'),
    getSettings(),
  ])
  const vars = buildVars(settings.business_name)
  const interpolated = interpolate(value, vars)
  const html = format === 'markdown' ? await markdownToHtml(interpolated) : sanitizeContent(interpolated)
  return (
    <article style={{ maxWidth: '760px', margin: '0 auto', padding: '80px 24px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', marginBottom: '48px', textAlign: 'center' }}>Our Story</h1>
      <div
        style={{ fontSize: '20px', lineHeight: '1.9', color: 'var(--color-text)' }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  )
}
