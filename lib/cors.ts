import { NextResponse } from 'next/server'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL

/**
 * Returns CORS headers for a given request.
 * Only sets Access-Control-Allow-Origin when APP_URL is configured.
 * When unset (local dev), the header is omitted and the browser enforces
 * same-origin naturally — 'same-origin' is NOT a valid header value.
 */
export function corsHeaders(requestOrigin?: string | null): HeadersInit {
  const headers: HeadersInit = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  }

  if (APP_URL) {
    // Echo back the request origin only if it matches the allowed app URL
    const origin = requestOrigin ?? ''
    if (origin === APP_URL) {
      headers['Access-Control-Allow-Origin'] = origin
    }
  }
  // If APP_URL is unset, omit the header entirely (browser same-origin enforcement)

  return headers
}

/**
 * Handle CORS preflight (OPTIONS) requests.
 * Export as `OPTIONS` from any API route that needs preflight support.
 */
export function handleOptions(request: Request) {
  const origin = request.headers.get('origin')
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) })
}

/**
 * Validate that a request comes from the allowed origin.
 * Returns a 403 response if origin doesn't match; null if OK to proceed.
 */
export function validateOrigin(request: Request): NextResponse | null {
  if (!APP_URL) return null // Unset in dev — allow all (same-origin enforced by browser)
  const origin = request.headers.get('origin')
  if (origin && origin !== APP_URL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}
