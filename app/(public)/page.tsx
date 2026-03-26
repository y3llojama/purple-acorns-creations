import { headers } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getAllContent } from '@/lib/content'
import { getSettings } from '@/lib/theme'
import { sanitizeText } from '@/lib/sanitize'
import { isValidHttpsUrl } from '@/lib/validate'
import { interpolate, buildVars } from '@/lib/variables'
import { JsonLd, buildOrganizationSchema } from '@/lib/seo'
import InstagramFeed from '@/components/home/InstagramFeed'
import NewsletterSignup from '@/components/home/NewsletterSignup'
import GalleryScroller from '@/components/home/GalleryScroller'
import ModernHero from '@/components/modern/ModernHero'
import ModernFeaturedGrid from '@/components/modern/ModernFeaturedGrid'
import ModernStorySection from '@/components/modern/ModernStorySection'
import ModernEventSection from '@/components/modern/ModernEventSection'
import type { Product, HeroSlide } from '@/lib/supabase/types'

// Shown when no featured gallery items exist in the DB yet.
// Disappears automatically once items are marked as featured in the admin panel.
const FALLBACK_FEATURED = [
  { id: 'local-1', image_url: '/gallery/featured-sunflower-earrings.jpg',   title: 'Sunflower Earrings',       description: null },
  { id: 'local-2', image_url: '/gallery/featured-gold-flatlay.jpg',          title: 'Brass Collection',         description: null },
  { id: 'local-3', image_url: '/gallery/featured-moonlit-lace-earrings.jpg', title: 'Moonlit Lace Earrings',    description: null },
  { id: 'local-4', image_url: '/gallery/featured-rose-sword-earrings.jpg',   title: 'Roses & Swords Earrings',  description: null },
  { id: 'local-5', image_url: '/gallery/featured-sunflower-card.jpg',        title: 'Sunflower Drop Earrings',  description: null },
]

export default async function HomePage() {
  const supabase = createServiceRoleClient()
  const today = new Date().toISOString().split('T')[0]

  // Build absolute base URL so relative gallery paths (e.g. /gallery/owl.jpg)
  // become valid https:// URLs that the watermark proxy can fetch.
  const hdrs = await headers()
  const host = hdrs.get('x-forwarded-host') ?? hdrs.get('host') ?? ''
  const proto = hdrs.get('x-forwarded-proto') ?? 'https'
  const siteBase = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_SITE_URL ?? '')

  const [content, settings, featured, gallery, eventResult, followAlongResult, heroSlides] = await Promise.all([
    getAllContent(),
    getSettings(),
    supabase.from('products').select('*').eq('is_active', true).eq('gallery_featured', true).order('gallery_sort_order').limit(8).then(r => r.data ?? []),
    supabase.from('gallery').select('*').eq('is_featured', false).order('sort_order').limit(8).then(r => r.data ?? []),
    supabase.from('events').select('*').eq('featured', true).gte('date', today).order('date').limit(1).single(),
    supabase.from('follow_along_photos').select('*').order('display_order').then(r => r.data ?? []),
    supabase
      .from('hero_slides')
      .select('id, url, alt_text, sort_order')
      .order('sort_order')
      .then(r => r.data ?? []),
  ])

  if (eventResult.error && eventResult.error.code !== 'PGRST116') {
    // PGRST116 = no rows found (expected when no upcoming events)
    console.error('[HomePage] events query error:', eventResult.error.message)
  }

  const vars = buildVars(settings.business_name)
  const orgSchema = buildOrganizationSchema(settings.business_name)
  const event = eventResult.data ? {
    ...eventResult.data,
    name: interpolate(eventResult.data.name, vars),
    description: eventResult.data.description ? interpolate(eventResult.data.description, vars) : eventResult.data.description,
    link_label: eventResult.data.link_label ? interpolate(eventResult.data.link_label, vars) : eventResult.data.link_label,
  } : null

  return (
    <>
      <JsonLd schema={orgSchema} />
      <ModernHero
        tagline={sanitizeText(interpolate(content.hero_tagline ?? '', vars))}
        subtext={sanitizeText(interpolate(content.hero_subtext ?? '', vars))}
        slides={(heroSlides as HeroSlide[]).filter(s => isValidHttpsUrl(s.url))}
        transition={(settings.hero_transition ?? 'crossfade') as 'crossfade' | 'slide'}
        intervalMs={settings.hero_interval_ms ?? 5000}
      />
      {(() => {
        const featuredItems = (featured as Product[])
          .filter(p => isValidHttpsUrl(p.images?.[0] ?? ''))
          .slice(0, 4)
          .map(p => ({ id: p.id, image_url: p.images[0], title: p.name, description: null }))
        return featuredItems.length > 0 ? (
          <ModernFeaturedGrid
            items={featuredItems}
            watermark={settings.gallery_watermark ? interpolate(settings.gallery_watermark, vars) : null}
          />
        ) : null
      })()}
      <GalleryScroller prefetchedFeatured={featured as Product[]} maxItems={settings.gallery_max_items ?? 8} watermark={settings.gallery_watermark ? interpolate(settings.gallery_watermark, vars) : null} />
      <ModernStorySection
        teaser={sanitizeText(interpolate(content.story_teaser ?? '', vars))}
        images={gallery.length > 0
          ? gallery.map(g => ({
              url: g.url.startsWith('http') ? g.url : `${siteBase}${g.url}`,
              alt_text: g.alt_text,
              square_url: g.square_url ?? null,
            }))
          : (featured as Product[])
              .filter(p => p.images?.[0]?.startsWith('https'))
              .slice(0, 5)
              .map(p => ({ url: p.images[0], alt_text: p.name, square_url: null }))}
        watermark={settings.gallery_watermark ? interpolate(settings.gallery_watermark, vars) : null}
      />
      <ModernEventSection event={event} />
      <InstagramFeed
        widgetId={settings.behold_widget_id}
        handle={settings.social_instagram}
        followAlongMode={settings.follow_along_mode}
        followAlongPhotos={followAlongResult}
      />
      <NewsletterSignup />
    </>
  )
}
