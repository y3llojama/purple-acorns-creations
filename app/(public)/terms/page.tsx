// Content is sanitized via markdownToHtml() or sanitizeContent() before rendering.
// dangerouslySetInnerHTML is safe here: all content passes through the allowlist-based sanitizer.
import { getContentWithFormat } from '@/lib/content'
import { sanitizeContent, markdownToHtml } from '@/lib/sanitize'
import { getSettings } from '@/lib/theme'
import { interpolate, buildVars } from '@/lib/variables'

export const metadata = { title: 'Terms of Service' }

export default async function TermsPage() {
  const [{ value, format }, settings] = await Promise.all([
    getContentWithFormat('terms_of_service'),
    getSettings(),
  ])
  const vars = buildVars(settings.business_name)
  const interpolated = interpolate(value, vars)
  const html = format === 'markdown' ? await markdownToHtml(interpolated) : sanitizeContent(interpolated)
  return (
    <>
      <style>{`
        .prose-content {
          font-family: 'Jost', sans-serif;
          font-size: 16px;
          line-height: 1.85;
          color: var(--color-text);
        }
        .prose-content h2 {
          font-family: var(--font-display, Georgia, serif);
          font-size: clamp(18px, 2vw, 22px);
          font-weight: 400;
          font-style: italic;
          color: var(--color-primary);
          margin: 48px 0 16px;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--color-border, rgba(0,0,0,0.08));
        }
        .prose-content h3 {
          font-family: 'Jost', sans-serif;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--color-primary);
          margin: 32px 0 10px;
        }
        .prose-content p { margin: 0 0 16px; }
        .prose-content p:last-child { margin-bottom: 0; }
        .prose-content ul, .prose-content ol { padding-left: 24px; margin: 0 0 16px; }
        .prose-content li { margin-bottom: 6px; }
        .prose-content a { color: var(--color-primary); text-underline-offset: 3px; }
        .prose-content a:hover { opacity: 0.75; }
        .prose-content strong { font-weight: 600; }
        .prose-content hr { border: none; border-top: 1px solid var(--color-border, rgba(0,0,0,0.08)); margin: 40px 0; }
      `}</style>
      <article style={{ maxWidth: '720px', margin: '0 auto', padding: '80px 24px 120px' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 400, fontStyle: 'italic', marginBottom: '12px', textAlign: 'center' }}>
          Terms of Service
        </h1>
        <p style={{ textAlign: 'center', color: 'var(--color-text)', opacity: 0.5, fontSize: '13px', fontFamily: "'Jost', sans-serif", letterSpacing: '0.06em', marginBottom: '64px' }}>
          Last updated {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}
        </p>
        <div className="prose-content" dangerouslySetInnerHTML={{ __html: html }} />
      </article>
    </>
  )
}
