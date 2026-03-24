import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getSquareClient } from '@/lib/channels/square/client'
import { pushInventoryToSquare } from '@/lib/channels/square/catalog'
import { calculateShipping } from '@/lib/shipping'
import { sanitizeText } from '@/lib/sanitize'
import type { ShippingAddress } from '@/lib/supabase/types'
import { squarePaymentError } from '@/lib/square/payment-errors'
import { getClientIp } from '@/lib/get-client-ip'
import crypto from 'crypto'

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
  const ip = getClientIp(request)
  if (!checkRate(ip)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await request.json().catch(() => ({}))
  const cart: LineItem[] = Array.isArray(body.cart) ? body.cart : []
  const sourceId: string = typeof body.sourceId === 'string' ? body.sourceId : ''
  const verificationToken: string | undefined = typeof body.verificationToken === 'string' ? body.verificationToken : undefined

  if (!cart.length) return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
  if (!sourceId) return NextResponse.json({ error: 'sourceId required' }, { status: 400 })

  // Require 3DS buyer verification — do not process payments without it
  if (!verificationToken) {
    return NextResponse.json({ error: 'Buyer verification required.' }, { status: 400 })
  }

  const shipping: ShippingAddress | null = body.shipping && typeof body.shipping === 'object' ? body.shipping as ShippingAddress : null
  const requiredFields: (keyof ShippingAddress)[] = ['name', 'address1', 'city', 'state', 'zip', 'country']
  if (!shipping || requiredFields.some(f => !shipping[f])) {
    return NextResponse.json({ error: 'Shipping address required' }, { status: 400 })
  }
  const cleanShipping: ShippingAddress = {
    name:     sanitizeText(shipping.name).slice(0, 100),
    address1: sanitizeText(shipping.address1).slice(0, 200),
    address2: shipping.address2 ? sanitizeText(shipping.address2).slice(0, 200) : undefined,
    city:     sanitizeText(shipping.city).slice(0, 100),
    state:    sanitizeText(shipping.state).slice(0, 100),
    zip:      sanitizeText(shipping.zip).slice(0, 20),
    country:  sanitizeText(shipping.country).slice(0, 10),
  }

  const supabase = createServiceRoleClient()

  // Step 1: Fetch product data + shipping settings (prices only — no stock check here)
  const [{ data: products }, { data: settingsRow }] = await Promise.all([
    supabase.from('products').select('id,name,price,stock_count,stock_reserved,square_variation_id').in('id', cart.map(i => i.productId)),
    supabase.from('settings').select('shipping_mode,shipping_value').limit(1).maybeSingle(),
  ])
  if (!products) return NextResponse.json({ error: 'Failed to validate cart' }, { status: 500 })
  for (const item of cart) {
    if (!products.find(p => p.id === item.productId)) {
      return NextResponse.json({ error: `Product not found: ${item.productId}` }, { status: 409 })
    }
  }

  const subtotal = cart.reduce((sum, item) => {
    const p = products.find(p => p.id === item.productId)!
    return sum + p.price * item.quantity
  }, 0)
  const shippingCost = calculateShipping(subtotal, settingsRow ?? { shipping_mode: 'fixed', shipping_value: 0 })
  const shippingCents = Math.round(shippingCost * 100)
  const totalCents = Math.round(subtotal * 100) + shippingCents

  // Step 2: Atomically decrement stock BEFORE charging the card.
  // This prevents the double-charge race: if two concurrent requests for the last unit both
  // pass a non-locking SELECT, only one will succeed the atomic UPDATE in decrement_stock.
  const decremented: LineItem[] = []
  for (const item of cart) {
    const { data: rows, error: rpcError } = await supabase.rpc('decrement_stock', { product_id: item.productId, qty: item.quantity })
    if (rpcError) {
      console.error('[checkout] decrement_stock error:', rpcError.message)
      for (const done of decremented) {
        await supabase.rpc('increment_stock', { product_id: done.productId, qty: done.quantity })
          .then(({ error }) => { if (error) console.error('[checkout] increment_stock rollback failed for', done.productId) })
      }
      return NextResponse.json({ error: 'Failed to reserve stock. Please try again.' }, { status: 500 })
    }
    if (Array.isArray(rows) && rows.length === 0) {
      const p = products.find(p => p.id === item.productId)!
      for (const done of decremented) {
        await supabase.rpc('increment_stock', { product_id: done.productId, qty: done.quantity })
          .then(({ error }) => { if (error) console.error('[checkout] increment_stock rollback failed for', done.productId) })
      }
      return NextResponse.json({ error: `${p.name} is sold out`, soldOut: item.productId }, { status: 409 })
    }
    decremented.push(item)
  }

  // Step 3: Charge card (stock is now reserved — no double-charge risk)
  // Use a server-generated UUID for idempotency (not client-supplied nonce suffix)
  const idem = crypto.randomUUID()
  let orderId = ''
  let paymentId = ''
  try {
    const { client, locationId } = await getSquareClient()

    const orderResult = await client.orders.create({
      order: {
        locationId,
        lineItems: [
          ...cart.map(item => {
            const p = products.find(p => p.id === item.productId)!
            return { name: p.name, quantity: String(item.quantity), basePriceMoney: { amount: BigInt(Math.round(p.price * 100)), currency: 'USD' as const } }
          }),
          ...(shippingCents > 0 ? [{ name: 'Shipping & Handling', quantity: '1', basePriceMoney: { amount: BigInt(shippingCents), currency: 'USD' as const } }] : []),
        ],
        fulfillments: [{
          type: 'SHIPMENT',
          state: 'PROPOSED',
          shipmentDetails: {
            recipient: {
              displayName: cleanShipping.name,
              address: {
                addressLine1: cleanShipping.address1,
                addressLine2: cleanShipping.address2 || undefined,
                locality: cleanShipping.city,
                administrativeDistrictLevel1: cleanShipping.state,
                postalCode: cleanShipping.zip,
                country: cleanShipping.country as 'US',
              },
            },
          },
        }],
      },
      idempotencyKey: `order-${idem}`,
    })
    orderId = orderResult.order?.id ?? ''
    if (!orderId) throw new Error('Square order created but returned no ID')

    const paymentResult = await client.payments.create({
      sourceId, orderId, locationId,
      amountMoney: { amount: BigInt(totalCents), currency: 'USD' },
      idempotencyKey: `pay-${idem}`,
      verificationToken,
    })
    paymentId = paymentResult.payment?.id ?? ''
  } catch (err) {
    // Charge failed — re-increment all decremented stock
    for (const done of decremented) {
      await supabase.rpc('increment_stock', { product_id: done.productId, qty: done.quantity })
        .then(({ error }) => { if (error) console.error('[checkout] increment_stock rollback failed for', done.productId) })
    }
    const { message, detail } = squarePaymentError(err)
    console.error('[checkout] Square error detail:', detail)
    return NextResponse.json({ error: message }, { status: 402 })
  }

  // Step 4: Fire-and-forget push to Square inventory (non-blocking)
  const squareItems = decremented
    .map(item => {
      const p = products.find(p => p.id === item.productId)
      return p?.square_variation_id
        ? { squareVariationId: p.square_variation_id, quantity: item.quantity }
        : null
    })
    .filter((x): x is { squareVariationId: string; quantity: number } => x !== null)
  if (squareItems.length > 0) {
    pushInventoryToSquare(squareItems).catch(err =>
      console.error('Square inventory push failed (non-blocking):', err)
    )
  }

  return NextResponse.json({ orderId, paymentId })
}
