export type Theme = 'warm-artisan' | 'soft-botanical' | 'custom' | 'modern'
export type Category = 'rings' | 'necklaces' | 'earrings' | 'bracelets' | 'crochet' | 'other'
export type AiProvider = 'claude' | 'openai' | 'groq'

export interface Settings {
  id: string; theme: Theme; logo_url: string | null
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
  square_access_token: string | null
  square_refresh_token: string | null
  square_location_id: string | null
  pinterest_access_token: string | null
  pinterest_refresh_token: string | null
  pinterest_catalog_id: string | null
  gallery_max_items: number
  square_sync_enabled: boolean
  pinterest_sync_enabled: boolean
  updated_at: string
  resend_api_key: string | null
  newsletter_from_name: string | null
  newsletter_from_email: string | null
  newsletter_admin_emails: string | null
  newsletter_scheduled_send_time: string | null
  ai_api_key: string | null
}

export interface Event {
  id: string; name: string; date: string; time: string | null; location: string
  description: string | null; link_url: string | null; link_label: string | null; created_at: string
}

export interface GalleryItem {
  id: string; url: string; alt_text: string; category: Category | null; sort_order: number; is_featured: boolean; square_url: string | null; product_id: string | null; created_at: string
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

export type NewsletterStatus = 'draft' | 'scheduled' | 'sent' | 'cancelled'
export type NewsletterTone = 'excited' | 'upbeat' | 'neutral' | 'reflective' | 'sombre' | 'celebratory'

export type NewsletterSection =
  | { type: 'text'; body: string }
  | { type: 'image'; image_url: string; caption?: string }
  | { type: 'cta'; label: string; url: string }

export interface Newsletter {
  id: string; slug: string; title: string; subject_line: string
  teaser_text: string; hero_image_url: string | null
  content: NewsletterSection[]; tone: NewsletterTone; status: NewsletterStatus
  ai_brief: Record<string, unknown> | null
  scheduled_at: string | null; sent_at: string | null
  created_at: string; updated_at: string
}

export interface NewsletterSubscriber {
  id: string; email: string; status: 'active' | 'unsubscribed' | 'bounced'
  unsubscribe_token: string; source: string
  subscribed_at: string; unsubscribed_at: string | null
}

export type ProductCategory = 'rings' | 'necklaces' | 'earrings' | 'bracelets' | 'crochet' | 'other'
export type ChannelStatus = 'pending' | 'synced' | 'error' | 'conflict'
export type Channel = 'square' | 'pinterest' | 'etsy'

export interface Product {
  id: string
  name: string
  description: string | null
  price: number
  category: ProductCategory
  stock_count: number
  images: string[]
  is_active: boolean
  gallery_featured: boolean
  gallery_sort_order: number | null
  view_count: number
  square_catalog_id: string | null
  square_variation_id: string | null
  pinterest_product_id: string | null
  created_at: string
  updated_at: string
}

export interface ChannelSyncLog {
  id: string
  product_id: string
  channel: Channel
  status: ChannelStatus
  synced_at: string | null
  error: string | null
  created_at: string
}
