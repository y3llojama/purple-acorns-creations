import { createHash } from 'crypto'

/** Allowed event types for the analytics tracker */
export const ALLOWED_EVENT_TYPES = [
  'page_view',
  'contact_submit',
  'newsletter_subscribe',
  'shop_click',
] as const

export type AnalyticsEventType = (typeof ALLOWED_EVENT_TYPES)[number]

/** Hash an IP address with a daily rotating salt for privacy-safe unique visitor counting */
export function hashIp(ip: string): string {
  const daySalt = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return createHash('sha256').update(`${ip}:${daySalt}`).digest('hex').slice(0, 16)
}

/** Derive device type from user-agent string */
export function parseDeviceType(ua: string | null): 'mobile' | 'tablet' | 'desktop' {
  if (!ua) return 'desktop'
  const lower = ua.toLowerCase()
  if (/ipad|tablet|kindle|silk|playbook/.test(lower)) return 'tablet'
  if (/mobile|iphone|ipod|android.*mobile|opera mini|opera mobi|iemobile|wpdesktop|windows phone|blackberry/.test(lower)) return 'mobile'
  return 'desktop'
}

/** Validate that a string is one of the allowed event types */
export function isAllowedEventType(type: string): type is AnalyticsEventType {
  return (ALLOWED_EVENT_TYPES as readonly string[]).includes(type)
}

/** Parse a period string like '7d', '30d', '1d' into a Date */
export function periodToDate(period: string): Date {
  const now = new Date()
  const match = period.match(/^(\d+)d$/)
  if (!match) return new Date(0) // 'all' — return epoch
  const days = parseInt(match[1], 10)
  now.setDate(now.getDate() - days)
  now.setHours(0, 0, 0, 0)
  return now
}
