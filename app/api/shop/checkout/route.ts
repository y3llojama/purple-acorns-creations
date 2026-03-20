import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getSquareClient } from '@/lib/channels/square/client'

const rateMap = new Map<string, { count: number; reset: number }>()
function checkRate(ip: string): boolean {
  const now = Date.now()
  const entry = rateMap.get(ip) ?? { count: 0, reset: now + 60_000 }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000 }
  entry.count++; rateMap.set(ip, entry)
  return entry.count <= 10
}

interface LineItem { productId: string; quantity: number }

export async function POST(request: Request) {
  const ip = (request.headers.get('x-forwarded-for') ?? 'unknown').split(',')[0].trim()
  if (!checkRate(ip)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await request.json().catch(() => ({}))
  const cart: LineItem[] = Array.isArray(body.cart) ? body.cart : []
  const sourceId: string = typeof body.sourceId === 'string' ? body.sourceId : ''
  if (!cart.length) return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
  if (!sourceId) return NextResponse.json({ error: 'sourceId required' }, { status: 400 })

  const supabase = createServiceRoleClient()

  // Step 1: Validate stock
  const { data: products } = await supabase
    .from('products').select('id,name,price,stock_count').in('id', cart.map(i => i.productId))
  if (!products) return NextResponse.json({ error: 'Failed to validate cart' }, { status: 500 })
  for (const item of cart) {
    const p = products.find(p => p.id === item.productId)
    if (!p) return NextResponse.json({ error: `Product not found: ${item.productId}` }, { status: 409 })
    if (p.stock_count < item.quantity) return NextResponse.json({ error: `${p.name} is sold out`, soldOut: item.productId }, { status: 409 })
  }

  // Steps 2 + 3: Create Square order then charge
  const totalCents = cart.reduce((sum, item) => {
    const p = products.find(p => p.id === item.productId)!
    return sum + Math.round(p.price * 100) * item.quantity
  }, 0)

  let orderId = ''
  let paymentId = ''
  try {
    const { client, locationId } = await getSquareClient()

    const { result: orderResult } = await client.ordersApi.createOrder({
      order: {
        locationId,
        lineItems: cart.map(item => {
          const p = products.find(p => p.id === item.productId)!
          return { name: p.name, quantity: String(item.quantity), basePriceMoney: { amount: BigInt(Math.round(p.price * 100)), currency: 'USD' } }
        }),
      },
      idempotencyKey: crypto.randomUUID(),
    })
    orderId = orderResult.order?.id ?? ''

    const { result: paymentResult } = await client.paymentsApi.createPayment({
      sourceId, orderId, locationId,
      amountMoney: { amount: BigInt(totalCents), currency: 'USD' },
      idempotencyKey: crypto.randomUUID(),
    })
    paymentId = paymentResult.payment?.id ?? ''
  } catch (err) {
    return NextResponse.json({ error: 'Payment failed', detail: String(err) }, { status: 402 })
  }

  // Step 4: Atomically decrement stock per item (charge already succeeded)
  const decremented: LineItem[] = []
  for (const item of cart) {
    const { data: rows } = await supabase.rpc('decrement_stock', { product_id: item.productId, qty: item.quantity })
    // Step 5: Race condition — item sold between validation and charge
    if (Array.isArray(rows) && rows.length === 0) {
      // Roll back stock for already-decremented items in this order
      for (const done of decremented) {
        await supabase.rpc('increment_stock', { product_id: done.productId, qty: done.quantity })
      }
      try {
        const { client } = await getSquareClient()
        await client.refundsApi.refundPayment({
          paymentId,
          idempotencyKey: `refund-${paymentId}`,
          amountMoney: { amount: BigInt(totalCents), currency: 'USD' },
          reason: 'Item sold out during checkout',
        })
      } catch (err) {
        console.error('Refund failed after sold-out race condition. paymentId:', paymentId, err)
      }
      return NextResponse.json({ error: 'Item sold out — payment refunded', soldOut: item.productId }, { status: 409 })
    }
    decremented.push(item)
  }

  return NextResponse.json({ orderId, paymentId })
}
