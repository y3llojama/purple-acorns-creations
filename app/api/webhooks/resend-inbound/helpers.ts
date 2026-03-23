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
 * Verifies the Resend HMAC signature header.
 * Header format: "t=<unix_ts>,v1=<hex_sig>"
 * Rejects requests older or newer than 5 minutes (replay protection).
 */
export function verifyInboundHmac(secret: string, header: string, rawBody: string): boolean {
  try {
    const parts = Object.fromEntries(
      header.split(',').map((p) => p.split('=', 2) as [string, string])
    )
    const timestamp = parts['t']
    const receivedSig = parts['v1']
    if (!timestamp || !receivedSig) return false

    const t = parseInt(timestamp, 10)
    if (isNaN(t)) return false

    const now = Math.floor(Date.now() / 1000)
    if (Math.abs(now - t) > 300) return false

    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex')

    const a = Buffer.from(receivedSig, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}
