import { createServiceRoleClient } from '@/lib/supabase/server'

export async function getContent(key: string): Promise<string> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('content').select('value').eq('key', key).single()
  return data?.value ?? ''
}

export async function getAllContent(): Promise<Record<string, string>> {
  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('content').select('key, value')
  return Object.fromEntries((data ?? []).map(r => [r.key, r.value]))
}
