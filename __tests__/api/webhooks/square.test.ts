import { verifySquareSignature } from '@/lib/channels/square/webhook'
import { createHmac } from 'crypto'

const WEBHOOK_KEY = 'test-webhook-key'
const WEBHOOK_URL = 'https://example.com/api/webhooks/square'

function makeSignature(url: string, body: string): string {
  return createHmac('sha256', WEBHOOK_KEY).update(url + body).digest('base64')
}

describe('verifySquareSignature', () => {
  it('returns true for valid signature', () => {
    const body = JSON.stringify({ type: 'inventory.count.updated' })
    const sig = makeSignature(WEBHOOK_URL, body)
    expect(verifySquareSignature(WEBHOOK_URL, body, sig, WEBHOOK_KEY)).toBe(true)
  })

  it('returns false for tampered body', () => {
    const body = JSON.stringify({ type: 'inventory.count.updated' })
    const sig = makeSignature(WEBHOOK_URL, body)
    expect(verifySquareSignature(WEBHOOK_URL, body + 'x', sig, WEBHOOK_KEY)).toBe(false)
  })

  it('returns false for wrong key', () => {
    const body = JSON.stringify({ type: 'test' })
    const sig = makeSignature(WEBHOOK_URL, body)
    expect(verifySquareSignature(WEBHOOK_URL, body, sig, 'wrong-key')).toBe(false)
  })
})
