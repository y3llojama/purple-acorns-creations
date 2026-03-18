import { createServiceRoleClient } from '@/lib/supabase/server'
import { getAllContent } from '@/lib/content'
import { getSettings } from '@/lib/theme'
import { sanitizeText } from '@/lib/sanitize'
import { interpolate, buildVars } from '@/lib/variables'
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

  return (
    <>
      <HeroSection
        tagline={sanitizeText(interpolate(content.hero_tagline ?? '', vars))}
        subtext={sanitizeText(interpolate(content.hero_subtext ?? '', vars))}
        heroImageUrl={settings.hero_image_url}
      />
      <StoryTeaser teaser={sanitizeText(interpolate(content.story_teaser ?? '', vars))} />
      <FeaturedPieces items={featured} watermark={settings.gallery_watermark} />
      <GalleryStrip items={gallery} watermark={settings.gallery_watermark} />
      <NextEvent event={eventResult.data ?? null} />
      <InstagramFeed widgetId={settings.behold_widget_id} handle={settings.social_instagram} followAlongMode={settings.follow_along_mode} followAlongPhotos={followAlongResult} />
      <NewsletterSignup />
    </>
  )
}
