export type Theme = 'warm-artisan' | 'soft-botanical' | 'custom'
export type Category = 'rings' | 'necklaces' | 'earrings' | 'bracelets' | 'crochet' | 'other'
export type AiProvider = 'claude' | 'openai' | 'groq'

export interface Settings {
  id: string; theme: Theme; logo_url: string | null; square_store_url: string | null
  contact_email: string | null; mailchimp_api_key: string | null; mailchimp_audience_id: string | null
  ai_provider: AiProvider | null; announcement_enabled: boolean; announcement_text: string | null
  announcement_link_url: string | null; announcement_link_label: string | null
  social_instagram: string | null; social_facebook: string | null; social_tiktok: string | null
  social_pinterest: string | null; social_x: string | null; behold_widget_id: string | null
  custom_primary: string | null
  custom_accent: string | null
  hero_image_url: string | null
  updated_at: string
}

export interface Event {
  id: string; name: string; date: string; time: string | null; location: string
  description: string | null; link_url: string | null; link_label: string | null; created_at: string
}

export interface GalleryItem {
  id: string; url: string; alt_text: string; category: Category | null; sort_order: number
  watermark_text: string | null; created_at: string
}

export interface FeaturedProduct {
  id: string; name: string; price: number; description: string | null
  image_url: string; square_url: string | null; sort_order: number; is_active: boolean
}

export interface ContentRow { key: string; value: string; updated_at: string }
