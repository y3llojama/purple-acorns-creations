import { NextResponse } from 'next/server'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL

/**
 * Returns CORS headers restricting API calls to same origin.
 * Use in API route OPTIONS handlers for preflight support.
 */
export function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': APP_URL ?? 'same-origin',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  }
}

/**
 * Handle CORS preflight (OPTIONS) requests.
 * Add `export { OPTIONS }` to any API route that needs it.
 */
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}

/**
 * Validate that a request comes from the same origin.
 * Returns a 403 response if origin doesn't match; null if OK.
 */
export function validateOrigin(request: Request): NextResponse | null {
  if (!APP_URL) return null // Allow all if not configured (dev mode)
  const origin = request.headers.get('origin')
  if (origin && origin !== APP_URL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}
