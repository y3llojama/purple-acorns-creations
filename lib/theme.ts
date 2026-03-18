import { createServiceRoleClient } from '@/lib/supabase/server'
import type { Settings, Theme } from '@/lib/supabase/types'

export async function getSettings(): Promise<Settings> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('settings').select('*').single()
  return data as Settings
}

export async function getTheme(): Promise<Theme> {
  const settings = await getSettings()
  return settings?.theme ?? 'warm-artisan'
}
