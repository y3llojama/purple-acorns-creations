import { createServiceRoleClient } from '@/lib/supabase/server'
import { getAllContent } from '@/lib/content'
import { getSettings } from '@/lib/theme'
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

  return (
    <>
      <HeroSection tagline={content.hero_tagline ?? ''} subtext={content.hero_subtext ?? ''} />
      <StoryTeaser teaser={content.story_teaser ?? ''} />
      <FeaturedPieces products={products} />
      <GalleryStrip items={gallery} />
      <NextEvent event={eventResult.data ?? null} />
      <InstagramFeed widgetId={settings.behold_widget_id} handle={settings.social_instagram} />
      <NewsletterSignup />
    </>
  )
}
