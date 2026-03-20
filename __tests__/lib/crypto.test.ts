import { encryptToken, decryptToken } from '@/lib/crypto'

describe('encryptToken / decryptToken', () => {
  it('round-trips a token', () => {
    const original = 'EAAAEMySecret_access_token_12345'
    const ciphertext = encryptToken(original)
    expect(ciphertext).not.toBe(original)
    expect(decryptToken(ciphertext)).toBe(original)
  })

  it('produces different ciphertext each call (random IV)', () => {
    const token = 'same-token'
    const a = encryptToken(token)
    const b = encryptToken(token)
    expect(a).not.toBe(b)
    expect(decryptToken(a)).toBe(token)
    expect(decryptToken(b)).toBe(token)
  })

  it('throws on tampered ciphertext', () => {
    const ct = encryptToken('valid-token')
    const tampered = ct.slice(0, -4) + 'XXXX'
    expect(() => decryptToken(tampered)).toThrow()
  })

  it('throws when OAUTH_ENCRYPTION_KEY is missing', () => {
    const saved = process.env.OAUTH_ENCRYPTION_KEY
    delete process.env.OAUTH_ENCRYPTION_KEY
    expect(() => encryptToken('token')).toThrow('OAUTH_ENCRYPTION_KEY')
    process.env.OAUTH_ENCRYPTION_KEY = saved
  })
})
