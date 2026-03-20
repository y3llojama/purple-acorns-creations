'use client'

import type { Newsletter, NewsletterSection } from '@/lib/supabase/types'
import { isValidHttpsUrl } from '@/lib/validate'

interface Props {
  newsletter: Newsletter
  onNext: () => void
  onBack: () => void
}

function renderSection(section: NewsletterSection, index: number) {
  if (section.type === 'text') {
    return (
      <div key={index} style={{ marginBottom: '20px' }}>
        <p style={{
          margin: 0,
          color: 'var(--color-text)',
          fontSize: '15px',
          lineHeight: '1.7',
          whiteSpace: 'pre-wrap',
        }}>
          {section.body}
        </p>
      </div>
    )
  }

  if (section.type === 'image') {
    if (!isValidHttpsUrl(section.image_url)) return null
    return (
      <div key={index} style={{ marginBottom: '20px', textAlign: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={section.image_url}
          alt={section.caption ?? ''}
          style={{ maxWidth: '100%', borderRadius: '6px', display: 'block', margin: '0 auto' }}
        />
        {section.caption && (
          <p style={{
            margin: '8px 0 0 0',
            fontSize: '13px',
            color: 'var(--color-text-muted)',
            fontStyle: 'italic',
          }}>
            {section.caption}
          </p>
        )}
      </div>
    )
  }

  if (section.type === 'cta') {
    return (
      <div key={index} style={{ marginBottom: '20px', textAlign: 'center' }}>
        <span style={{
          display: 'inline-block',
          padding: '12px 28px',
          background: 'var(--color-primary)',
          color: 'var(--color-bg)',
          borderRadius: '6px',
          fontSize: '15px',
          fontWeight: 600,
          cursor: 'default',
          userSelect: 'none',
        }}>
          {section.label}
        </span>
        <p style={{
          margin: '6px 0 0 0',
          fontSize: '12px',
          color: 'var(--color-text-muted)',
        }}>
          {section.url}
        </p>
      </div>
    )
  }

  return null
}

export default function PreviewStep({ newsletter, onNext, onBack }: Props) {
  const buttonStyle: React.CSSProperties = {
    minHeight: '48px',
    padding: '12px 24px',
    border: 'none',
    borderRadius: '6px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 0.15s',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Section heading */}
      <div>
        <h2 style={{ margin: '0 0 4px 0', fontFamily: 'var(--font-display)', color: 'var(--color-text)', fontSize: '22px' }}>
          Preview
        </h2>
        <p style={{ margin: 0, color: 'var(--color-text-muted)', fontSize: '14px' }}>
          This is how your newsletter will look in email clients.
        </p>
      </div>

      {/* Email preview box */}
      <div style={{
        maxWidth: '600px',
        margin: '0 auto',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        background: 'var(--color-surface)',
        overflow: 'hidden',
        width: '100%',
      }}>
        {/* Brand header banner */}
        <div style={{
          background: 'var(--color-primary)',
          padding: '24px 32px',
          textAlign: 'center',
        }}>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: '22px',
            fontWeight: 700,
            color: 'var(--color-bg)',
            letterSpacing: '0.02em',
          }}>
            Purple Acorns Creations
          </span>
        </div>

        {/* Main content */}
        <div style={{ padding: '32px' }}>
          {/* Title */}
          <h1 style={{
            margin: '0 0 12px 0',
            fontFamily: 'var(--font-display)',
            fontSize: '26px',
            color: 'var(--color-text)',
            lineHeight: '1.3',
          }}>
            {newsletter.title}
          </h1>

          {/* Teaser */}
          {newsletter.teaser_text && (
            <p style={{
              margin: '0 0 24px 0',
              fontSize: '15px',
              color: 'var(--color-text-muted)',
              lineHeight: '1.6',
            }}>
              {newsletter.teaser_text}
            </p>
          )}

          {/* Divider */}
          <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '0 0 24px 0' }} />

          {/* Hero image */}
          {newsletter.hero_image_url && isValidHttpsUrl(newsletter.hero_image_url) && (
            <div style={{ marginBottom: '24px' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={newsletter.hero_image_url}
                alt={newsletter.title}
                style={{ width: '100%', display: 'block', borderRadius: '6px' }}
              />
            </div>
          )}

          {/* Content sections */}
          {Array.isArray(newsletter.content) && newsletter.content.map((section, i) =>
            renderSection(section, i)
          )}
        </div>

        {/* Footer */}
        <div style={{
          borderTop: '1px solid var(--color-border)',
          padding: '20px 32px',
          background: 'var(--color-bg)',
          textAlign: 'center',
        }}>
          <p style={{
            margin: 0,
            fontSize: '12px',
            color: 'var(--color-text-muted)',
          }}>
            You are receiving this because you subscribed to Purple Acorns Creations updates.{' '}
            <span style={{ textDecoration: 'underline', cursor: 'default' }}>Unsubscribe</span>
          </p>
        </div>
      </div>

      {/* Navigation buttons */}
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            ...buttonStyle,
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
          }}
        >
          &larr; Back
        </button>
        <button
          type="button"
          onClick={onNext}
          style={{
            ...buttonStyle,
            background: 'var(--color-primary)',
            color: 'var(--color-bg)',
          }}
        >
          Schedule &amp; Send &rarr;
        </button>
      </div>
    </div>
  )
}
