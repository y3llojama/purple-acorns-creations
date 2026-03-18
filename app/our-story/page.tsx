// Content is sanitized via sanitizeContent() (sanitize-html library) before rendering.
// dangerouslySetInnerHTML is safe here: all DB content passes through the allowlist-based sanitizer.
import { getContent } from '@/lib/content'
import { sanitizeContent } from '@/lib/sanitize'

export const metadata = { title: 'Our Story' }

export default async function OurStoryPage() {
  const raw = await getContent('story_full')
  const html = sanitizeContent(raw)
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
