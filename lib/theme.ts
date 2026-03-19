import { unstable_noStore as noStore } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/server'
import type { Settings, Theme } from '@/lib/supabase/types'

const DEFAULT_THEME: Theme = 'modern'


const DEFAULT_SETTINGS: Settings = {
  id: '', theme: DEFAULT_THEME, logo_url: null, square_store_url: null,
  contact_email: null, mailchimp_api_key: null, mailchimp_audience_id: null,
  ai_provider: null, announcement_enabled: false, announcement_text: null,
  announcement_link_url: null, announcement_link_label: null,
  social_instagram: 'purpleacornz', social_facebook: null, social_tiktok: null,
  social_pinterest: null, social_x: null, behold_widget_id: null,
  custom_primary: null, custom_accent: null, hero_image_url: null, gallery_watermark: null, follow_along_mode: 'widget',
  smtp_host: 'smtp.gmail.com', smtp_port: 587, smtp_user: null, smtp_pass: null,
  business_name: 'Purple Acorns Creations',
  updated_at: '',
}

export async function getSettings(): Promise<Settings> {
  noStore()
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.from('settings').select('*').limit(1).maybeSingle()
  if (error || !data) {
    console.error('[getSettings] Failed to load settings:', error?.message)
    return DEFAULT_SETTINGS
  }
  return { ...DEFAULT_SETTINGS, ...data } as Settings
}

