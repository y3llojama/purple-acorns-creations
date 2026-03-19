export type Theme = 'warm-artisan' | 'soft-botanical' | 'custom' | 'modern'
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
  gallery_watermark: string | null
  follow_along_mode: 'gallery' | 'widget' | null
  smtp_host: string | null
  smtp_port: number | null
  smtp_user: string | null
  smtp_pass: string | null
  business_name: string
  updated_at: string
}

export interface Event {
  id: string; name: string; date: string; time: string | null; location: string
  description: string | null; link_url: string | null; link_label: string | null; created_at: string
}

export interface GalleryItem {
  id: string; url: string; alt_text: string; category: Category | null; sort_order: number; is_featured: boolean; square_url: string | null; created_at: string
}

export interface FollowAlongPhoto {
  id: string
  storage_path: string
  display_order: number
  created_at: string
}

export interface ContentRow { key: string; value: string; updated_at: string }

export interface Message {
  id: string; name: string; email: string; message: string
  is_read: boolean; created_at: string
}

export interface MessageReply {
  id: string; message_id: string; body: string; created_at: string
}
