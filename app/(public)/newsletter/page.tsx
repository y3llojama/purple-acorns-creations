import { createServiceRoleClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { isValidHttpsUrl } from '@/lib/validate'

export const metadata = { title: 'Newsletter — Purple Acorns Creations' }

export default async function NewsletterArchivePage() {
  const supabase = createServiceRoleClient()
  const { data: newsletters } = await supabase
    .from('newsletters')
    .select('slug, title, teaser_text, hero_image_url, sent_at')
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })

  return (
    <main style={{ maxWidth: '720px', margin: '0 auto', padding: '48px 24px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', marginBottom: '8px' }}>
        Newsletter Archive
      </h1>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '40px', fontSize: '17px' }}>
        Stories from our studio — past issues
      </p>

      {!newsletters || newsletters.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No newsletters yet — check back soon!</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {newsletters.map((nl) => (
            <li key={nl.slug} style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', paddingBottom: '32px', borderBottom: '1px solid var(--color-border)' }}>
              {nl.hero_image_url && isValidHttpsUrl(nl.hero_image_url) && (
                <img
                  src={nl.hero_image_url}
                  alt=""
                  style={{ width: '80px', height: '64px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }}
                />
              )}
              <div>
                <p style={{ margin: '0 0 4px', fontSize: '13px', color: 'var(--color-text-muted)' }}>
                  {nl.sent_at ? new Date(nl.sent_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : ''}
                </p>
                <Link
                  href={`/newsletter/${nl.slug}`}
                  style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, color: 'var(--color-primary)', textDecoration: 'none' }}
                >
                  {nl.title}
                </Link>
                {nl.teaser_text && (
                  <p style={{ margin: '6px 0 0', fontSize: '14px', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
                    {nl.teaser_text}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
