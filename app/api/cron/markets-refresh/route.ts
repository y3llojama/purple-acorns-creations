import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { decryptSettings } from '@/lib/crypto'
import { runMarketsDiscovery } from '@/lib/markets-discovery'

export const maxDuration = 60

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceRoleClient()
  const { data: settingsRow } = await supabase
    .from('settings').select('search_api_key, ai_provider, ai_api_key').single()

  if (!settingsRow) return NextResponse.json({ skipped: true, reason: 'no settings' })

  const settings = decryptSettings(settingsRow)
  const searchApiKey = process.env.SEARCH_API_KEY ?? settings?.search_api_key
  const aiProvider = settings?.ai_provider
  const aiApiKey = process.env.AI_API_KEY ?? settings?.ai_api_key

  if (!searchApiKey || !aiProvider || !aiApiKey) {
    return NextResponse.json({ skipped: true, reason: 'missing API keys' })
  }

  const result = await runMarketsDiscovery(searchApiKey, aiProvider, aiApiKey)
  return NextResponse.json(result)
}
