import Script from 'next/script'
import { sanitizeText } from '@/lib/sanitize'

interface Props { widgetId: string | null; handle: string | null }

export default function InstagramFeed({ widgetId, handle }: Props) {
  const safeHandle = sanitizeText(handle ?? 'purpleacornz') || 'purpleacornz'
  return (
    <section style={{ padding: '64px 24px', background: 'var(--color-bg)', textAlign: 'center' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '32px', color: 'var(--color-primary)', marginBottom: '32px' }}>
        Follow Along
      </h2>
      {widgetId ? (
        <>
          <div className="behold-widget" data-behold-id={widgetId}></div>
          <Script src="https://w.behold.so/widget.js" strategy="lazyOnload" />
        </>
      ) : (
        <a
          href={`https://instagram.com/${safeHandle}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--color-primary)', fontSize: '20px', textDecoration: 'underline' }}
        >
          Follow us on Instagram
        </a>
      )}
    </section>
  )
}
