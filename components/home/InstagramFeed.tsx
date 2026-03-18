import Script from 'next/script'
import { sanitizeText } from '@/lib/sanitize'
import FollowAlongStrip from './FollowAlongStrip'
import type { FollowAlongPhoto } from '@/lib/supabase/types'

interface Props {
  widgetId: string | null
  handle: string | null
  followAlongMode: 'gallery' | 'widget' | null
  followAlongPhotos: FollowAlongPhoto[]
}

export default function InstagramFeed({ widgetId, handle, followAlongMode, followAlongPhotos }: Props) {
  const safeHandle = sanitizeText(handle ?? 'purpleacornz') || 'purpleacornz'

  // Gallery mode with photos available
  if (followAlongMode === 'gallery' && followAlongPhotos.length > 0) {
    return (
      <section style={{ padding: '64px 24px', background: 'var(--color-bg)', textAlign: 'center' }}>
        <FollowAlongStrip photos={followAlongPhotos} handle={safeHandle} />
      </section>
    )
  }

  // Widget mode (or gallery mode with no photos)
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
