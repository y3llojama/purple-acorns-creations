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
