import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { sanitizeContent } from '@/lib/sanitize'
import { isValidHttpsUrl } from '@/lib/validate'
import type { NewsletterSection } from '@/lib/supabase/types'
import type { Metadata } from 'next'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const supabase = createServiceRoleClient()
  const { data } = await supabase
    .from('newsletters')
    .select('title, teaser_text')
    .eq('slug', slug)
    .eq('status', 'sent')
    .single()
  if (!data) return { title: 'Newsletter — Purple Acorns Creations' }
  return { title: `${data.title} — Purple Acorns Creations`, description: data.teaser_text }
}

export default async function NewsletterDetailPage({ params }: Props) {
  const { slug } = await params
  const supabase = createServiceRoleClient()
  const { data: newsletter } = await supabase
    .from('newsletters')
    .select('slug, title, teaser_text, hero_image_url, content, sent_at')
    .eq('slug', slug)
    .eq('status', 'sent')
    .single()

  if (!newsletter) notFound()

  const sections = (newsletter.content ?? []) as NewsletterSection[]

  return (
    <main style={{ maxWidth: '680px', margin: '0 auto', padding: '48px 24px' }}>
      {/* Date */}
      <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>
        Newsletter ·{' '}
        {newsletter.sent_at
          ? new Date(newsletter.sent_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
          : ''}
      </p>

      {/* Title */}
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '32px', color: 'var(--color-primary)', marginBottom: '12px', lineHeight: 1.3 }}>
        {newsletter.title}
      </h1>

      {/* Teaser */}
      <p style={{ fontSize: '18px', color: 'var(--color-text-muted)', marginBottom: '32px', lineHeight: 1.6 }}>
        {newsletter.teaser_text}
      </p>

      {/* Hero image */}
      {newsletter.hero_image_url && isValidHttpsUrl(newsletter.hero_image_url) && (
        <img
          src={newsletter.hero_image_url}
          alt=""
          style={{ width: '100%', borderRadius: '6px', marginBottom: '32px', display: 'block' }}
        />
      )}

      {/* Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {sections.map((section, i) => {
          if (section.type === 'text') {
            return (
              <div
                key={i}
                style={{ fontSize: '16px', lineHeight: 1.8, color: 'var(--color-text)' }}
                dangerouslySetInnerHTML={{ __html: sanitizeContent(section.body) }}
              />
            )
          }
          if (section.type === 'image') {
            return isValidHttpsUrl(section.image_url) ? (
              <figure key={i} style={{ margin: 0 }}>
                <img
                  src={section.image_url}
                  alt={section.caption ?? ''}
                  style={{ width: '100%', borderRadius: '4px', display: 'block' }}
                />
                {section.caption && (
                  <figcaption style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                    {section.caption}
                  </figcaption>
                )}
              </figure>
            ) : null
          }
          if (section.type === 'cta') {
            return isValidHttpsUrl(section.url) ? (
              <div key={i} style={{ textAlign: 'center' }}>
                <a
                  href={section.url}
                  rel="noopener noreferrer"
                  target="_blank"
                  style={{
                    display: 'inline-block',
                    padding: '14px 32px',
                    background: 'var(--color-accent)',
                    color: 'var(--color-primary)',
                    borderRadius: '4px',
                    textDecoration: 'none',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                    fontSize: '16px',
                  }}
                >
                  {section.label}
                </a>
              </div>
            ) : null
          }
          return null
        })}
      </div>

      {/* Footer */}
      <div style={{ marginTop: '48px', paddingTop: '24px', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '24px', fontSize: '14px' }}>
        <Link href="/newsletter" style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>← All newsletters</Link>
        <Link href="/#subscribe" style={{ color: 'var(--color-accent)' }}>Subscribe</Link>
      </div>
    </main>
  )
}
