import crypto from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const PREFIX = 'enc:'

// Sensitive settings fields — encrypted at rest, decrypted only on the server
export const SENSITIVE_SETTINGS_FIELDS = [
  'mailchimp_api_key',
  'ai_api_key',
  'resend_api_key',
  'smtp_pass',
  'smtp_user',
  'contact_email',
  'newsletter_from_email',
  'newsletter_admin_emails',
] as const

export type SensitiveField = typeof SENSITIVE_SETTINGS_FIELDS[number]

function getKey(): Buffer {
  const raw = process.env.OAUTH_ENCRYPTION_KEY
  if (!raw) throw new Error('OAUTH_ENCRYPTION_KEY environment variable is not set')
  const buf = Buffer.from(raw, 'base64')
  if (buf.length !== 32) throw new Error('OAUTH_ENCRYPTION_KEY must decode to exactly 32 bytes')
  return buf
}

/**
 * Encrypt a plain-text string. Returns an `enc:<iv>:<ciphertext>:<tag>` hex string.
 * Empty / null values are returned unchanged.
 */
export function encryptValue(plaintext: string): string {
  if (!plaintext) return plaintext
  const key = getKey()
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`
}

/**
 * Decrypt a value previously encrypted by encryptValue.
 * Values that don't start with `enc:` are returned as-is (backward compat with plain-text rows).
 */
export function decryptValue(value: string): string {
  if (!value || !value.startsWith(PREFIX)) return value
  try {
    const key = getKey()
    const [ivHex, encHex, tagHex] = value.slice(PREFIX.length).split(':')
    const iv = Buffer.from(ivHex, 'hex')
    const encrypted = Buffer.from(encHex, 'hex')
    const tag = Buffer.from(tagHex, 'hex')
    const decipher = crypto.createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(tag)
    return decipher.update(encrypted).toString('utf8') + decipher.final('utf8')
  } catch {
    console.error('[crypto] decryptValue failed — returning raw value')
    return value
  }
}

/**
 * Decrypt all sensitive fields in a settings-like object in one pass.
 * Safe to call with partial selects (only decrypts fields that are present).
 */
export function decryptSettings<T extends Partial<Record<SensitiveField, string | null>>>(settings: T): T {
  const result = { ...settings }
  for (const field of SENSITIVE_SETTINGS_FIELDS) {
    const val = result[field]
    if (val) (result as Record<string, string | null>)[field] = decryptValue(val)
  }
  return result
}
