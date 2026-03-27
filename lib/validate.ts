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

export const MESSAGE_ATTACHMENT_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
export const MESSAGE_ATTACHMENT_MAX_SIZE = 5 * 1024 * 1024 // 5 MB

export function validateImageAttachment(file: File): string | null {
  if (!MESSAGE_ATTACHMENT_ALLOWED_TYPES.includes(file.type))
    return 'File type not allowed. Only JPEG, PNG, WebP, and GIF images are allowed.'
  if (file.size > MESSAGE_ATTACHMENT_MAX_SIZE) return 'Image must be under 5MB.'
  return null
}

/** Validate slug format: lowercase alphanumeric + hyphens, 1-60 chars */
export function isValidSlug(str: string): boolean {
  return /^[a-z0-9-]{1,60}$/.test(str)
}
