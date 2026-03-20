import { notFound } from 'next/navigation'
import { createServiceRoleClient } from '@/lib/supabase/server'
import NewsletterComposer from '@/components/admin/newsletter/NewsletterComposer'
import type { Newsletter } from '@/lib/supabase/types'

type Props = { params: Promise<{ id: string }> }

export const metadata = { title: 'Admin — Compose Newsletter' }

export default async function NewsletterComposePage({ params }: Props) {
  const { id } = await params
  const supabase = createServiceRoleClient()

  // Parallel fetch: newsletter, gallery, upcoming events, settings
  const today = new Date().toISOString().split('T')[0]
  const [newsletterResult, galleryResult, eventsResult, settingsResult] = await Promise.all([
    supabase.from('newsletters').select('*').eq('id', id).single(),
    supabase.from('gallery').select('id, url, alt_text').order('sort_order', { ascending: true }).limit(50),
    supabase.from('events').select('name, date, location').gte('date', today).order('date', { ascending: true }).limit(10),
    supabase.from('settings').select('ai_provider, ai_api_key, resend_api_key, newsletter_from_email, newsletter_scheduled_send_time').single(),
  ])

  if (newsletterResult.error || !newsletterResult.data) notFound()

  const settings = settingsResult.data
  const hasAi = !!(settings?.ai_provider && (process.env.AI_API_KEY ?? settings?.ai_api_key))
  const hasResend = !!((process.env.RESEND_API_KEY ?? settings?.resend_api_key) && (process.env.NEWSLETTER_FROM_EMAIL ?? settings?.newsletter_from_email))

  return (
    <NewsletterComposer
      newsletter={newsletterResult.data as Newsletter}
      galleryItems={galleryResult.data ?? []}
      upcomingEvents={eventsResult.data ?? []}
      defaultSendTime={settings?.newsletter_scheduled_send_time ?? '10:00'}
      hasAi={hasAi}
      hasResend={hasResend}
    />
  )
}
