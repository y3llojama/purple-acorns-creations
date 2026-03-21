import type { MetadataRoute } from 'next'
import { createServiceRoleClient } from '@/lib/supabase/server'

const base = 'https://www.purpleacornz.com'

const staticPages: MetadataRoute.Sitemap = [
  { url: base, lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
  { url: `${base}/shop`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
  { url: `${base}/our-story`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
  { url: `${base}/contact`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.6 },
  { url: `${base}/newsletter`, lastModified: new Date(), changeFrequency: 'yearly', priority: 0.5 },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  try {
    const supabase = createServiceRoleClient()
    const { data: products } = await supabase
      .from('products')
      .select('id, updated_at')
      .eq('is_active', true)

    const productPages: MetadataRoute.Sitemap = (products ?? []).map((p) => ({
      url: `${base}/shop/${p.id}`,
      lastModified: new Date(p.updated_at),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }))

    return [...staticPages, ...productPages]
  } catch {
    return staticPages
  }
}
