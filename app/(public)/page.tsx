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
import ModernHero from '@/components/modern/ModernHero'
import ModernFeaturedGrid from '@/components/modern/ModernFeaturedGrid'
import ModernStorySection from '@/components/modern/ModernStorySection'
import ModernEventSection from '@/components/modern/ModernEventSection'

export default async function HomePage() {
  const isModern = process.env.NEXT_PUBLIC_LAYOUT_MODE === 'modern'
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

  if (isModern) {
    return (
      <>
        <ModernHero
          tagline={sanitizeText(interpolate(content.hero_tagline ?? '', vars))}
          subtext={sanitizeText(interpolate(content.hero_subtext ?? '', vars))}
          heroImageUrl={settings.hero_image_url}
        />
        <ModernFeaturedGrid
          items={featured.map(item => ({ id: item.id, image_url: item.url, title: item.alt_text || null, description: null }))}
          watermark={settings.gallery_watermark}
          squareStoreUrl={settings.square_store_url}
        />
        <ModernStorySection teaser={sanitizeText(interpolate(content.story_teaser ?? '', vars))} />
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
      <NextEvent event={event} />
      <InstagramFeed widgetId={settings.behold_widget_id} handle={settings.social_instagram} followAlongMode={settings.follow_along_mode} followAlongPhotos={followAlongResult} />
      <NewsletterSignup />
    </>
  )
}
