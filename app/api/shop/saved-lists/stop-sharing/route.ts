import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { isValidUuid } from '@/lib/validate'
import { checkRate, rateLimitResponse } from '@/lib/saved-lists-rate-limit'

export async function POST(request: Request) {
  if (!checkRate(request, 'list-stop-sharing', 5, 60_000)) return rateLimitResponse()

  let body: { token?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { token } = body
  if (!token || !isValidUuid(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  const { error } = await supabase
    .from('saved_lists')
    .update({ slug: null, edit_token: null })
    .eq('token', token)

  if (error) {
    return NextResponse.json({ error: 'Failed to stop sharing' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
