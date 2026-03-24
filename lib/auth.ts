import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function requireAdminSession(): Promise<
  { user: { email: string }; error: null } |
  { user: null; error: NextResponse }
> {
  const supabase = await createServerSupabaseClient()
  // getUser() performs server-side JWT verification — never use getSession() for auth
  const { data: { user }, error } = await supabase.auth.getUser()

  if (!user || error) {
    return { user: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim()).filter(Boolean)
  if (!adminEmails.length) {
    console.error('[auth] ADMIN_EMAILS is not configured — all admin access denied')
  }
  if (!adminEmails.includes(user.email ?? '')) {
    return { user: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { user: user as { email: string }, error: null }
}
