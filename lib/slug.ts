import crypto from 'crypto'

const RESERVED_SLUGS = new Set(['share', 'me', 'items', 'stop-sharing'])

function randomSuffix(length: number): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.randomBytes(length)
  return Array.from(bytes, b => chars[b % chars.length]).join('')
}

function kebab(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function generateSlug(descriptors: string[]): string {
  const cleaned = descriptors
    .slice(0, 3)
    .map(kebab)
    .filter(Boolean)

  const prefix = cleaned.length > 0 ? cleaned.join('-') : 'favorites'
  const suffixLen = 8
  const maxPrefixLen = 60 - suffixLen - 1 // 1 for the hyphen before suffix
  const truncatedPrefix = prefix.slice(0, maxPrefixLen).replace(/-$/, '')

  let slug = `${truncatedPrefix}-${randomSuffix(suffixLen)}`

  // Avoid reserved slugs (extremely unlikely but handle it)
  if (RESERVED_SLUGS.has(slug)) {
    slug = `${truncatedPrefix}-${randomSuffix(suffixLen)}`
  }

  return slug
}
