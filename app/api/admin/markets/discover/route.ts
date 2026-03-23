import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { decryptSettings } from '@/lib/crypto'
import { runMarketsDiscovery } from '@/lib/markets-discovery'

export const maxDuration = 60

export async function POST() {
  const { error } = await requireAdminSession()
  if (error) return error

  const supabase = createServiceRoleClient()
  const { data: settingsRow, error: settingsError } = await supabase
    .from('settings').select('search_api_key, ai_provider, ai_api_key').single()
  if (settingsError) return NextResponse.json({ error: 'Failed to load settings.' }, { status: 500 })

  const settings = settingsRow ? decryptSettings(settingsRow) : null
  const searchApiKey = process.env.SEARCH_API_KEY ?? settings?.search_api_key
  const aiProvider = settings?.ai_provider
  const aiApiKey = process.env.AI_API_KEY ?? settings?.ai_api_key

  if (!searchApiKey) return NextResponse.json({ error: 'Tavily API key not configured. Add it in Admin → Integrations → Event Search.' }, { status: 503 })
  if (!aiProvider || !aiApiKey) return NextResponse.json({ error: 'AI provider not configured. Set AI provider and key in Admin → Integrations.' }, { status: 503 })

  const result = await runMarketsDiscovery(searchApiKey, aiProvider, aiApiKey)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 502 })
  return NextResponse.json(result)
}
