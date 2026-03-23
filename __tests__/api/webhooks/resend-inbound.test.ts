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
  // secret in whsec_ format — base64 of "test-secret-bytes"
  const rawSecret = 'test-secret-bytes-for-hmac-test!'
  const secret = `whsec_${Buffer.from(rawSecret).toString('base64')}`

  function makeSvixHeaders(svixId: string, body: string, offsetSeconds = 0) {
    const t = Math.floor(Date.now() / 1000) + offsetSeconds
    const svixTimestamp = String(t)
    const secretBytes = Buffer.from(rawSecret)
    const toSign = `${svixId}.${svixTimestamp}.${body}`
    const sig = crypto.createHmac('sha256', secretBytes).update(toSign).digest('base64')
    return { svixId, svixTimestamp, svixSignature: `v1,${sig}` }
  }

  it('returns true for valid signature and fresh timestamp', () => {
    const body = '{"type":"email.received"}'
    const { svixId, svixTimestamp, svixSignature } = makeSvixHeaders('msg_123', body)
    expect(verifyInboundHmac(secret, svixId, svixTimestamp, svixSignature, body)).toBe(true)
  })

  it('returns false for invalid signature', () => {
    const body = '{"type":"email.received"}'
    const { svixId, svixTimestamp } = makeSvixHeaders('msg_123', body)
    expect(verifyInboundHmac(secret, svixId, svixTimestamp, 'v1,badsig==', body)).toBe(false)
  })

  it('returns false when timestamp is older than 5 minutes', () => {
    const body = '{"type":"email.received"}'
    const { svixId, svixTimestamp, svixSignature } = makeSvixHeaders('msg_123', body, -301)
    expect(verifyInboundHmac(secret, svixId, svixTimestamp, svixSignature, body)).toBe(false)
  })

  it('returns false when timestamp is more than 5 minutes in the future', () => {
    const body = '{"type":"email.received"}'
    const { svixId, svixTimestamp, svixSignature } = makeSvixHeaders('msg_123', body, 301)
    expect(verifyInboundHmac(secret, svixId, svixTimestamp, svixSignature, body)).toBe(false)
  })

  it('returns false for missing headers', () => {
    expect(verifyInboundHmac(secret, '', '', '', '{}')).toBe(false)
  })
})
