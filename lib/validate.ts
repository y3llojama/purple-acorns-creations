export function isValidEmail(email: string): boolean {
  // Reject HTML special characters that could indicate injection attempts
  if (/[<>"']/.test(email)) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function isValidHttpsUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function clampLength(str: string, max: number): string {
  return str.slice(0, max)
}

/** Strip control characters that enable email header injection (\r, \n, \0) */
export function stripControlChars(str: string): string {
  return str.replace(/[\r\n\0]/g, ' ').trim()
}

/** Validate UUID v4 format */
export function isValidUuid(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}
