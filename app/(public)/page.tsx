import { createServiceRoleClient } from '@/lib/supabase/server'
import { getAllContent } from '@/lib/content'
import { getSettings } from '@/lib/theme'
import { sanitizeText } from '@/lib/sanitize'
import HeroSection from '@/components/home/HeroSection'
import StoryTeaser from '@/components/home/StoryTeaser'
import FeaturedPieces from '@/components/home/FeaturedPieces'
import GalleryStrip from '@/components/home/GalleryStrip'
import NextEvent from '@/components/home/NextEvent'
import InstagramFeed from '@/components/home/InstagramFeed'
import NewsletterSignup from '@/components/home/NewsletterSignup'

export default async function HomePage() {
  const supabase = createServiceRoleClient()
  const today = new Date().toISOString().split('T')[0]

  const [content, settings, products, gallery, eventResult] = await Promise.all([
    getAllContent(),
    getSettings(),
    supabase.from('featured_products').select('*').eq('is_active', true).order('sort_order').then(r => r.data ?? []),
    supabase.from('gallery').select('*').order('sort_order').limit(8).then(r => r.data ?? []),
    supabase.from('events').select('*').gte('date', today).order('date').limit(1).single(),
  ])

  if (eventResult.error && eventResult.error.code !== 'PGRST116') {
    // PGRST116 = no rows found (expected when no upcoming events)
    console.error('[HomePage] events query error:', eventResult.error.message)
  }

  return (
    <>
      <HeroSection
        tagline={sanitizeText(content.hero_tagline ?? '')}
        subtext={sanitizeText(content.hero_subtext ?? '')}
        heroImageUrl={settings.hero_image_url}
      />
      <StoryTeaser teaser={sanitizeText(content.story_teaser ?? '')} />
      <FeaturedPieces products={products} />
      <GalleryStrip items={gallery} watermark={settings.gallery_watermark} />
      <NextEvent event={eventResult.data ?? null} />
      <InstagramFeed widgetId={settings.behold_widget_id} handle={settings.social_instagram} />
      <NewsletterSignup />
    </>
  )
}
