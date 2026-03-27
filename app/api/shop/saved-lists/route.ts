import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { checkRate, rateLimitResponse } from '@/lib/saved-lists-rate-limit'

export async function POST(request: Request) {
  if (!checkRate(request, 'list-create', 5, 3_600_000)) return rateLimitResponse()

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('saved_lists')
    .insert({})
    .select('id, token')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to create list' }, { status: 500 })
  }

  return NextResponse.json({ id: data.id, token: data.token })
}
