/**
 * Extract the true client IP from a request.
 *
 * Priority order:
 * 1. `x-real-ip` — set by Vercel's edge infrastructure; cannot be spoofed by clients.
 *    This is the reliable source in production.
 * 2. `x-forwarded-for` (rightmost entry) — added by the nearest trusted proxy.
 *    NEVER use the leftmost entry: it is fully client-controlled.
 * 3. 'unknown' — fallback for local development where no proxy headers are present.
 *
 * Limitation: On non-Vercel platforms without x-real-ip, a malicious client behind
 * a single proxy can set x-forwarded-for to an arbitrary value. This is acceptable
 * for rate-limiting purposes (worst case: the attacker rate-limits under a spoofed
 * IP, not their real one — they still can't bypass the limit for their actual IP).
 *
 * Do NOT use this function for authentication or access-control decisions.
 */
export function getClientIp(request: Request): string {
  const realIp = request.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp

  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const rightmost = forwarded.split(',').at(-1)?.trim()
    if (rightmost) return rightmost
  }

  return 'unknown'
}
