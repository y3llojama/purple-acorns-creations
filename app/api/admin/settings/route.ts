import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { requireAdminSession } from '@/lib/auth'
import { isValidHttpsUrl, isValidEmail } from '@/lib/validate'
import { sanitizeText } from '@/lib/sanitize'
import { encryptValue } from '@/lib/crypto'

const ALLOWED_THEMES = ['warm-artisan', 'soft-botanical', 'custom', 'modern'] as const
type Theme = typeof ALLOWED_THEMES[number]

export async function POST(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const update: Record<string, string | boolean | null> = {}

  if (body.theme !== undefined) {
    if (!ALLOWED_THEMES.includes(String(body.theme) as Theme)) return NextResponse.json({ error: 'Invalid theme' }, { status: 400 })
    update.theme = String(body.theme)
    if (body.theme === 'warm-artisan' || body.theme === 'soft-botanical' || body.theme === 'modern') {
      update.custom_primary = null
      update.custom_accent  = null
    }
  }
  // Hex color fields — only processed when saving a custom theme
  // (named presets always clear these server-side, ignoring what the client sends)
  const savingNamedPreset = body.theme === 'warm-artisan' || body.theme === 'soft-botanical' || body.theme === 'modern'
  if (!savingNamedPreset) {
    for (const field of ['custom_primary', 'custom_accent'] as const) {
      if (body[field] !== undefined) {
        if (body[field] === null) {
          update[field] = null
        } else {
          const val = String(body[field])
          if (!/^#[0-9a-fA-F]{6}$/.test(val)) return NextResponse.json({ error: `Invalid hex color for ${field}` }, { status: 400 })
          update[field] = val
        }
      }
    }
  }
  // URL fields — only store validated https URLs
  for (const field of ['logo_url', 'square_store_url', 'announcement_link_url', 'hero_image_url'] as const) {
    if (body[field] !== undefined) {
      const val = String(body[field] ?? '')
      update[field] = val ? (isValidHttpsUrl(val) ? val : null) : null
    }
  }
  if (body.contact_email !== undefined) {
    const email = String(body.contact_email ?? '')
    update.contact_email = isValidEmail(email) ? email : null
  }
  if (body.announcement_enabled !== undefined) update.announcement_enabled = Boolean(body.announcement_enabled)
  if (body.announcement_text !== undefined) update.announcement_text = sanitizeText(String(body.announcement_text ?? '')).slice(0, 300) || null
  if (body.announcement_link_label !== undefined) update.announcement_link_label = sanitizeText(String(body.announcement_link_label ?? '')).slice(0, 100) || null
  // Social handles (stored as handle only — not full URL)
  for (const field of ['social_instagram', 'social_tiktok', 'social_pinterest', 'social_x'] as const) {
    if (body[field] !== undefined) update[field] = sanitizeText(String(body[field] ?? '')).slice(0, 100) || null
  }
  // social_facebook stored as full https URL
  if (body.social_facebook !== undefined) {
    const val = String(body.social_facebook ?? '')
    update.social_facebook = val ? (isValidHttpsUrl(val) ? val : null) : null
  }
  if (body.behold_widget_id !== undefined) update.behold_widget_id = sanitizeText(String(body.behold_widget_id ?? '')).slice(0, 100) || null
  if (body.follow_along_mode !== undefined) {
    const mode = String(body.follow_along_mode)
    update.follow_along_mode = ['gallery', 'widget'].includes(mode) ? mode : 'widget'
  }
  if (body.gallery_watermark !== undefined) update.gallery_watermark = sanitizeText(String(body.gallery_watermark ?? '')).slice(0, 100) || null
  if (body.business_name !== undefined) {
    const name = sanitizeText(String(body.business_name ?? '')).slice(0, 200).trim()
    if (name) update.business_name = name
  }
  // Square app credentials — secret is encrypted at rest.
  // Omitting square_application_secret from the body preserves the existing encrypted value.
  if (body.square_application_id !== undefined) {
    update.square_application_id = sanitizeText(String(body.square_application_id ?? '')).slice(0, 200) || null
  }
  if (body.square_application_secret !== undefined) {
    const secret = String(body.square_application_secret ?? '').trim()
    update.square_application_secret = secret ? encryptValue(secret) : null
  }
  if (body.square_environment !== undefined) {
    const env = String(body.square_environment ?? '')
    update.square_environment = ['sandbox', 'production'].includes(env) ? env : 'sandbox'
  }
  if (body.ai_provider !== undefined) {
    const val = String(body.ai_provider ?? '')
    update.ai_provider = ['claude', 'openai', 'groq'].includes(val) ? val : null
  }
  if (body.ai_api_key !== undefined) {
    const key = String(body.ai_api_key ?? '').trim()
    if (key) update.ai_api_key = encryptValue(key)
  }
  if (body.search_api_key !== undefined) {
    const key = String(body.search_api_key ?? '').trim()
    if (key) update.search_api_key = encryptValue(key)
  }
  if (body.resend_api_key !== undefined) {
    const key = String(body.resend_api_key ?? '').trim()
    if (key) update.resend_api_key = encryptValue(key)
  }
  for (const field of ['newsletter_from_name', 'newsletter_from_email', 'newsletter_admin_emails', 'messages_from_email'] as const) {
    if (body[field] !== undefined) update[field] = sanitizeText(String(body[field] ?? '')).slice(0, 200) || null
  }
  if (body.newsletter_scheduled_send_time !== undefined) {
    const val = String(body.newsletter_scheduled_send_time ?? '')
    update.newsletter_scheduled_send_time = /^\d{2}:\d{2}$/.test(val) ? val : null
  }

  update.updated_at = new Date().toISOString()
  const supabase = createServiceRoleClient()
  // Fetch the single settings row ID first, then update by ID
  const { data: row, error: fetchError } = await supabase.from('settings').select('id').limit(1).maybeSingle()
  if (fetchError || !row) {
    console.error('[settings] fetch error:', fetchError?.message)
    return NextResponse.json({ error: 'Failed to load settings row' }, { status: 500 })
  }
  const { error: dbError } = await supabase.from('settings').update(update).eq('id', row.id)
  if (dbError) {
    console.error('[settings] update error:', dbError.message)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
  revalidatePath('/', 'layout')
  return NextResponse.json({ success: true })
}
