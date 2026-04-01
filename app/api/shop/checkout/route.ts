import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getSquareClient } from '@/lib/channels/square/client'
import { pushInventoryToSquare } from '@/lib/channels/square/catalog'
import { calculateShipping, resolveShippingTier } from '@/lib/shipping'
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

interface LineItem { productId: string; variationId: string; quantity: number }

export async function POST(request: Request) {
  const ip = getClientIp(request)
  if (!checkRate(ip)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const body = await request.json().catch(() => ({}))
  const cart: LineItem[] = Array.isArray(body.cart) ? body.cart : []
  const sourceId: string = typeof body.sourceId === 'string' ? body.sourceId : ''
  const verificationToken: string | undefined = typeof body.verificationToken === 'string' ? body.verificationToken : undefined

  if (!cart.length) return NextResponse.json({ error: 'Cart is empty' }, { status: 400 })
  if (cart.some(i => !Number.isInteger(i.quantity) || i.quantity < 1)) {
    return NextResponse.json({ error: 'Invalid cart' }, { status: 400 })
  }
  if (cart.some(i => !i.variationId || typeof i.variationId !== 'string')) {
    return NextResponse.json({ error: 'variationId required for each item' }, { status: 400 })
  }
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
    country:  sanitizeText(shipping.country).trim().toUpperCase().slice(0, 2),
  }
  if (!/^[A-Z]{2}$/.test(cleanShipping.country)) {
    return NextResponse.json({ error: 'Country must be a 2-letter code (e.g. US, CA, GB)' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  // Step 1: Fetch variation data (with product name join) + shipping settings
  const variationIds = cart.map(i => i.variationId)
  const [{ data: variations }, { data: settingsRow }] = await Promise.all([
    supabase.from('product_variations').select('id,product_id,price,square_variation_id,is_active,stock_count,stock_reserved,product:products(id,name)').in('id', variationIds),
    supabase.from('settings').select('shipping_mode,shipping_value,shipping_mode_canada_mexico,shipping_value_canada_mexico,shipping_mode_intl,shipping_value_intl').limit(1).maybeSingle(),
  ])
  if (!variations) return NextResponse.json({ error: 'Failed to validate cart' }, { status: 500 })

  for (const item of cart) {
    const v = variations.find((v: Record<string, unknown>) => v.id === item.variationId) as Record<string, unknown> | undefined
    if (!v) return NextResponse.json({ error: `Variation not found: ${item.variationId}` }, { status: 409 })
    if (!v.is_active) {
      const prod = v.product as { name?: string } | null
      return NextResponse.json({ error: `${prod?.name ?? item.productId} is no longer available` }, { status: 409 })
    }
    if (v.product_id !== item.productId) return NextResponse.json({ error: 'Invalid cart' }, { status: 400 })
  }

  const subtotal = cart.reduce((sum, item) => {
    const v = variations!.find(v => v.id === item.variationId)!
    return sum + v.price * item.quantity
  }, 0)
  const shippingDefaults = { shipping_mode: 'fixed' as const, shipping_value: 0, shipping_mode_canada_mexico: 'fixed' as const, shipping_value_canada_mexico: 0, shipping_mode_intl: 'fixed' as const, shipping_value_intl: 0 }
  const shippingTier = resolveShippingTier(cleanShipping.country, settingsRow ?? shippingDefaults)
  const shippingCost = calculateShipping(subtotal, shippingTier)
  const shippingCents = Math.round(shippingCost * 100)
  const totalCents = Math.round(subtotal * 100) + shippingCents

  // Step 2: Atomically decrement stock BEFORE charging the card.
  // This prevents the double-charge race: if two concurrent requests for the last unit both
  // pass a non-locking SELECT, only one will succeed the atomic UPDATE in decrement_variation_stock.
  const decremented: LineItem[] = []
  for (const item of cart) {
    const { data: rows, error: rpcError } = await supabase.rpc('decrement_variation_stock', { var_id: item.variationId, qty: item.quantity })
    if (rpcError) {
      console.error('[checkout] decrement_variation_stock error:', rpcError.message)
      for (const done of decremented) {
        await supabase.rpc('increment_variation_stock', { var_id: done.variationId, qty: done.quantity })
          .then(({ error }) => { if (error) console.error('[checkout] increment_variation_stock rollback failed for', done.variationId) })
      }
      return NextResponse.json({ error: 'Failed to reserve stock. Please try again.' }, { status: 500 })
    }
    if (Array.isArray(rows) && rows.length === 0) {
      for (const done of decremented) {
        await supabase.rpc('increment_variation_stock', { var_id: done.variationId, qty: done.quantity })
          .then(({ error }) => { if (error) console.error('[checkout] increment_variation_stock rollback failed for', done.variationId) })
      }
      const v = variations!.find((v: Record<string, unknown>) => v.id === item.variationId) as Record<string, unknown> | undefined
      const prod = v?.product as { name?: string } | null
      const label = prod?.name ?? item.productId
      return NextResponse.json({ error: `${label} is sold out`, soldOut: item.productId }, { status: 409 })
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
            const v = variations!.find((v: Record<string, unknown>) => v.id === item.variationId)! as Record<string, unknown>
            const prod = v.product as { name?: string } | null
            return { name: prod?.name ?? item.productId, quantity: String(item.quantity), basePriceMoney: { amount: BigInt(Math.round((v.price as number) * 100)), currency: 'USD' as const } }
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
      await supabase.rpc('increment_variation_stock', { var_id: done.variationId, qty: done.quantity })
        .then(({ error }) => { if (error) console.error('[checkout] increment_variation_stock rollback failed for', done.variationId) })
    }
    const { message, detail } = squarePaymentError(err)
    console.error('[checkout] Square error detail:', detail)
    return NextResponse.json({ error: message }, { status: 402 })
  }

  // Guard: payment call succeeded but Square returned no payment ID (API anomaly)
  // Do NOT rollback stock — the charge may have gone through. Log for manual review.
  if (!paymentId) {
    console.error('[checkout] Square payment returned no ID — manual investigation required. orderId:', orderId)
    return NextResponse.json({ error: 'Payment processing error. Please contact support.' }, { status: 500 })
  }

  // Step 4: Fire-and-forget push to Square inventory (non-blocking)
  const squareItems = decremented
    .map(item => {
      const v = variations!.find(v => v.id === item.variationId)
      return v?.square_variation_id
        ? { squareVariationId: v.square_variation_id, quantity: item.quantity }
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
