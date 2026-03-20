import { NextResponse } from 'next/server'
import { verifySquareSignature, handleInventoryUpdate, handleCatalogConflict } from '@/lib/channels/square/webhook'

export async function POST(request: Request) {
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
