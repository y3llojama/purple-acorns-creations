import { createServiceRoleClient } from '@/lib/supabase/server'
import { getAllContent } from '@/lib/content'
import { getSettings } from '@/lib/theme'
import { sanitizeText } from '@/lib/sanitize'
import { interpolate, buildVars } from '@/lib/variables'
import InstagramFeed from '@/components/home/InstagramFeed'
import NewsletterSignup from '@/components/home/NewsletterSignup'
import ModernHero from '@/components/modern/ModernHero'
import ModernFeaturedGrid from '@/components/modern/ModernFeaturedGrid'
import ModernStorySection from '@/components/modern/ModernStorySection'
import ModernEventSection from '@/components/modern/ModernEventSection'

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

  const [content, settings, featured, gallery, eventResult, followAlongResult] = await Promise.all([
    getAllContent(),
    getSettings(),
    supabase.from('gallery').select('*').eq('is_featured', true).order('sort_order').then(r => r.data ?? []),
    supabase.from('gallery').select('*').eq('is_featured', false).order('sort_order').limit(8).then(r => r.data ?? []),
    supabase.from('events').select('*').gte('date', today).order('date').limit(1).single(),
    supabase.from('follow_along_photos').select('*').order('display_order').then(r => r.data ?? []),
  ])

  if (eventResult.error && eventResult.error.code !== 'PGRST116') {
    // PGRST116 = no rows found (expected when no upcoming events)
    console.error('[HomePage] events query error:', eventResult.error.message)
  }

  const vars = buildVars(settings.business_name)
  const event = eventResult.data ? {
    ...eventResult.data,
    name: interpolate(eventResult.data.name, vars),
    description: eventResult.data.description ? interpolate(eventResult.data.description, vars) : eventResult.data.description,
    link_label: eventResult.data.link_label ? interpolate(eventResult.data.link_label, vars) : eventResult.data.link_label,
  } : null

  return (
    <>
      <ModernHero
        tagline={sanitizeText(interpolate(content.hero_tagline ?? '', vars))}
        subtext={sanitizeText(interpolate(content.hero_subtext ?? '', vars))}
        heroImageUrl={settings.hero_image_url}
      />
      <ModernFeaturedGrid
        items={(() => {
          const dbItems = featured
            .filter(item => item.url?.startsWith('http') || item.url?.startsWith('/'))
            .map(item => ({ id: item.id, image_url: item.url, title: item.alt_text || null, description: null }))
          return dbItems.length > 0 ? dbItems : FALLBACK_FEATURED
        })()}
        watermark={settings.gallery_watermark ? interpolate(settings.gallery_watermark, vars) : null}
        squareStoreUrl={settings.square_store_url}
      />
      <ModernStorySection
        teaser={sanitizeText(interpolate(content.story_teaser ?? '', vars))}
        images={gallery.length > 0
          ? gallery.map(g => ({ url: g.url, alt_text: g.alt_text }))
          : FALLBACK_FEATURED.map(f => ({ url: f.image_url, alt_text: f.title ?? '' }))}
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
