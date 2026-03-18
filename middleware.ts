// Supabase Google OAuth setup (manual — one-time dashboard steps):
// 1. Supabase dashboard → Authentication → Providers → Google
//    Enable Google provider, paste Google OAuth Client ID + Secret
// 2. Auth → Users → "Invite user" for each admin email (pre-register authorized users)
// 3. Auth → Settings → disable "Allow new users to sign up"
//    This ensures only invited users can authenticate.
//
// See also: docs/supabase-setup.md

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (!pathname.startsWith('/admin')) return NextResponse.next()
  if (pathname === '/admin/login') return NextResponse.next()

  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => request.cookies.get(n)?.value,
        set: (n, v, o) => { response.cookies.set({ name: n, value: v, ...o }) },
        remove: (n, o) => { response.cookies.set({ name: n, value: '', ...o }) },
      },
    }
  )

  // Use getUser() — performs server-side JWT verification (never getSession())
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/admin/login', request.url))

  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim())
  if (!adminEmails.includes(user.email ?? '')) {
    await supabase.auth.signOut()
    // Copy session-clearing cookies from response (written by signOut) to redirect
    const redirectResponse = NextResponse.redirect(new URL('/admin/login?error=unauthorized', request.url))
    response.cookies.getAll().forEach(c => redirectResponse.cookies.set(c))
    return redirectResponse
  }

  return response
}

export const config = { matcher: ['/admin/:path*'] }
