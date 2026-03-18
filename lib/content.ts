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

export type ContentFormat = 'html' | 'markdown'

/** Fetch a content value and its stored format ('html' | 'markdown'). */
export async function getContentWithFormat(key: string): Promise<{ value: string; format: ContentFormat }> {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('content')
    .select('key, value')
    .in('key', [key, `${key}__format`])
  if (error) console.error(`[getContentWithFormat] Failed to load key "${key}":`, error.message)
  const rows = Object.fromEntries((data ?? []).map(r => [r.key, r.value]))
  const format = (rows[`${key}__format`] === 'markdown' ? 'markdown' : 'html') as ContentFormat
  return { value: rows[key] ?? '', format }
}
