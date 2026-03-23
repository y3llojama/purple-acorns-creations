import crypto from 'crypto'
import { parseFromEmail, verifyInboundHmac } from '@/app/api/webhooks/resend-inbound/helpers'

describe('parseFromEmail', () => {
  it('extracts email from "Name <email>" format', () => {
    expect(parseFromEmail('Jane Doe <jane@example.com>')).toBe('jane@example.com')
  })
  it('returns bare address unchanged', () => {
    expect(parseFromEmail('jane@example.com')).toBe('jane@example.com')
  })
  it('returns null for invalid input', () => {
    expect(parseFromEmail('not-an-email')).toBeNull()
  })
  it('returns null for empty string', () => {
    expect(parseFromEmail('')).toBeNull()
  })
})

describe('verifyInboundHmac', () => {
  const secret = 'test-secret'

  function makeHeader(body: string, offsetSeconds = 0) {
    const t = Math.floor(Date.now() / 1000) + offsetSeconds
    const sig = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')
    return `t=${t},v1=${sig}`
  }

  it('returns true for valid signature and fresh timestamp', () => {
    const body = '{"type":"email.received"}'
    expect(verifyInboundHmac(secret, makeHeader(body), body)).toBe(true)
  })

  it('returns false for invalid signature', () => {
    const body = '{"type":"email.received"}'
    const t = Math.floor(Date.now() / 1000)
    expect(verifyInboundHmac(secret, `t=${t},v1=badhash`, body)).toBe(false)
  })

  it('returns false when timestamp is older than 5 minutes', () => {
    const body = '{"type":"email.received"}'
    expect(verifyInboundHmac(secret, makeHeader(body, -301), body)).toBe(false)
  })

  it('returns false when timestamp is more than 5 minutes in the future', () => {
    const body = '{"type":"email.received"}'
    expect(verifyInboundHmac(secret, makeHeader(body, 301), body)).toBe(false)
  })

  it('returns false for missing t= or v1= parts', () => {
    expect(verifyInboundHmac(secret, 'garbage', '{}')).toBe(false)
  })
})
