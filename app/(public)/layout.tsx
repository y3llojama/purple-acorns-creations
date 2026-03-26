import { getSettings } from '@/lib/theme'
import { sanitizeText } from '@/lib/sanitize'
import { interpolate, buildVars } from '@/lib/variables'
import { createServiceRoleClient } from '@/lib/supabase/server'
import ModernLayout from '@/components/modern/ModernLayout'

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServiceRoleClient()
  const [settings, { data: flatCats }] = await Promise.all([
    getSettings(),
    supabase.from('categories').select('id, name, slug, parent_id').eq('online_visibility', true).order('sort_order', { ascending: true }),
  ])
  const navCategories = (flatCats ?? [])
    .filter((c: { parent_id: string | null }) => !c.parent_id)
    .map((p: { id: string; name: string; slug: string; parent_id: string | null }) => ({
      id: p.id, name: p.name, slug: p.slug,
      children: (flatCats ?? [])
        .filter((c: { parent_id: string | null }) => c.parent_id === p.id)
        .map((c: { id: string; name: string; slug: string }) => ({ id: c.id, name: c.name, slug: c.slug })),
    }))
  const vars = buildVars(settings.business_name)
  const announcementText = settings.announcement_text
    ? sanitizeText(interpolate(settings.announcement_text, vars))
    : ''

  return (
    <ModernLayout
      navCategories={navCategories}
      settings={settings}
      announcementText={announcementText}
      announcementLinkUrl={settings.announcement_link_url ?? null}
      announcementLinkLabel={settings.announcement_link_label ? sanitizeText(interpolate(settings.announcement_link_label, vars)) : null}
      announcementEnabled={settings.announcement_enabled}
    >
      {children}
    </ModernLayout>
  )
}
