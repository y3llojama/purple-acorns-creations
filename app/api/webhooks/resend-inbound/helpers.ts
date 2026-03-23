import crypto from 'crypto'
import { isValidEmail } from '@/lib/validate'

/**
 * Extracts a valid email address from a From header value.
 * Handles both "Name <email>" and bare "email" formats.
 * Returns null if no valid email found.
 */
export function parseFromEmail(from: string): string | null {
  const angleMatch = from.match(/<([^>]+)>/)
  const candidate = angleMatch ? angleMatch[1] : from.trim()
  return isValidEmail(candidate) ? candidate : null
}

/**
 * Verifies a Svix-signed webhook (used by Resend for all webhook delivery).
 * Svix sends three headers: svix-id, svix-timestamp, svix-signature.
 * Signed payload: "{svix-id}.{svix-timestamp}.{rawBody}"
 * Secret format: "whsec_<base64>" — base64 decoded before use.
 * Rejects requests older or newer than 5 minutes (replay protection).
 */
export function verifyInboundHmac(
  secret: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  rawBody: string
): boolean {
  try {
    if (!svixId || !svixTimestamp || !svixSignature) return false

    const t = parseInt(svixTimestamp, 10)
    if (isNaN(t)) return false
    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - t) > 300) return false

    // Secret is "whsec_<base64>" — decode the base64 portion
    const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
    const toSign = `${svixId}.${svixTimestamp}.${rawBody}`
    const expected = crypto
      .createHmac('sha256', secretBytes)
      .update(toSign)
      .digest('base64')

    // svix-signature may contain multiple space-separated "v1,<base64>" entries
    const signatures = svixSignature.split(' ')
    for (const sig of signatures) {
      const [version, b64] = sig.split(',', 2)
      if (version !== 'v1' || !b64) continue
      const a = Buffer.from(b64, 'base64')
      const b = Buffer.from(expected, 'base64')
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true
    }
    return false
  } catch {
    return false
  }
}
