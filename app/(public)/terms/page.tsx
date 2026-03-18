// Content is sanitized via markdownToHtml() or sanitizeContent() before rendering.
// dangerouslySetInnerHTML is safe here: all content passes through the allowlist-based sanitizer.
import { getContentWithFormat } from '@/lib/content'
import { sanitizeContent, markdownToHtml } from '@/lib/sanitize'

export const metadata = { title: 'Terms of Service' }

export default async function TermsPage() {
  const { value, format } = await getContentWithFormat('terms_of_service')
  const html = format === 'markdown' ? await markdownToHtml(value) : sanitizeContent(value)
  return (
    <article style={{ maxWidth: '760px', margin: '0 auto', padding: '80px 24px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', marginBottom: '48px', textAlign: 'center' }}>Terms of Service</h1>
      <div
        style={{ fontSize: '20px', lineHeight: '1.9', color: 'var(--color-text)' }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </article>
  )
}
