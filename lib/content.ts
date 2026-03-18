import { createServiceRoleClient } from '@/lib/supabase/server'

export async function getContent(key: string): Promise<string> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.from('content').select('value').eq('key', key).single()
  if (error) console.error(`[getContent] Failed to load key "${key}":`, error.message)
  return data?.value ?? ''
}

export async function getAllContent(): Promise<Record<string, string>> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.from('content').select('key, value')
  if (error) console.error('[getAllContent] Failed to load content:', error.message)
  return Object.fromEntries((data ?? []).map(r => [r.key, r.value]))
}
