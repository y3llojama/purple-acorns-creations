/**
 * Extract the true client IP from a request.
 *
 * On Vercel, x-real-ip is set by the edge infrastructure and cannot be spoofed.
 * When absent (local dev, other platforms), we take the rightmost x-forwarded-for
 * entry — the one added by the nearest trusted proxy, not the client.
 *
 * NEVER take the leftmost x-forwarded-for value: it is set by the client.
 */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('x-real-ip')?.trim() ??
    request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ??
    'unknown'
  )
}
