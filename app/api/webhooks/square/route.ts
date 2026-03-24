import { NextResponse } from 'next/server'
import { verifySquareSignature, handleInventoryUpdate, handleCatalogConflict } from '@/lib/channels/square/webhook'
import { getClientIp } from '@/lib/get-client-ip'

// In-memory rate limiter: 120 requests per IP per 60 seconds (Square uses shared egress IPs)
const rateLimitMap = new Map<string, { count: number; reset: number }>()

export async function POST(request: Request) {
  const ip = getClientIp(request)
  const now = Date.now()
  const entry = rateLimitMap.get(ip) ?? { count: 0, reset: now + 60_000 }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000 }
  entry.count++; rateLimitMap.set(ip, entry)
  if (entry.count > 120) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  const rawBody = await request.text()
  const signature = request.headers.get('x-square-hmacsha256-signature') ?? ''
  const webhookKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY ?? ''

  if (!verifySquareSignature(request.url, rawBody, signature, webhookKey)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: unknown
  try { payload = JSON.parse(rawBody) } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const eventType = (payload as { type?: string })?.type
  if (eventType === 'inventory.count.updated') await handleInventoryUpdate(payload)
  else if (eventType === 'catalog.version.updated') await handleCatalogConflict(payload)

  return NextResponse.json({ received: true })
}
