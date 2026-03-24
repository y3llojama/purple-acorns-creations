import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  // Only guard admin API routes
  if (!request.nextUrl.pathname.startsWith('/api/admin/')) {
    return NextResponse.next()
  }

  // OAuth callbacks are initiated by external redirects — exclude them from the auth gate
  // (requireAdminSession inside each callback handler still applies)
  const isOAuthCallback =
    request.nextUrl.pathname.includes('/channels/square/callback') ||
    request.nextUrl.pathname.includes('/channels/pinterest/callback')

  if (isOAuthCallback) {
    return NextResponse.next()
  }

  const response = NextResponse.next()

  // Use anon key for session check — JWT verification and ADMIN_EMAILS check
  // happen inside requireAdminSession() in each handler. This is the fallback layer.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return response
}

export const config = {
  matcher: ['/api/admin/:path*'],
}
