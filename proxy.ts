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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Use getUser() — performs server-side JWT verification (never getSession())
  // Also refreshes the session token and writes updated cookies to the response
  const { data: { user } } = await supabase.auth.getUser()

  // Guard /api/admin/* routes — defense-in-depth before handlers run
  // OAuth callbacks are initiated by external redirects so are excluded here;
  // requireAdminSession() inside each callback handler still applies.
  if (pathname.startsWith('/api/admin/')) {
    const isOAuthCallback =
      pathname.includes('/channels/square/callback') ||
      pathname.includes('/channels/pinterest/callback')

    if (!isOAuthCallback && !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return response
  }

  // For other API routes: let the route handler return 401/403 — don't redirect
  if (pathname.startsWith('/api/')) return response

  // For admin pages: redirect unauthenticated users to login
  if (!pathname.startsWith('/admin') || pathname === '/admin/login') return response

  if (!user) return NextResponse.redirect(new URL('/admin/login', request.url))

  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim()).filter(Boolean)
  if (!adminEmails.includes(user.email ?? '')) {
    await supabase.auth.signOut()
    // Copy session-clearing cookies from response (written by signOut) to redirect
    const redirectResponse = NextResponse.redirect(new URL('/admin/login?error=unauthorized', request.url))
    response.cookies.getAll().forEach(c => redirectResponse.cookies.set(c))
    return redirectResponse
  }

  return response
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/api/admin/:path*',
  ],
}
