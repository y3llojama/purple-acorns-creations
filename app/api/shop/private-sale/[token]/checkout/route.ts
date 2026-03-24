import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getSquareClient } from '@/lib/channels/square/client'
import { calculateShipping } from '@/lib/shipping'
import { sanitizeText } from '@/lib/sanitize'
import type { ShippingAddress } from '@/lib/supabase/types'
import { squarePaymentError } from '@/lib/square/payment-errors'
import { getClientIp } from '@/lib/get-client-ip'

const rateMap = new Map<string, { count: number; reset: number }>()
function checkRate(ip: string): boolean {
  const now = Date.now()
  const entry = rateMap.get(ip) ?? { count: 0, reset: now + 60_000 }
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 60_000 }
  entry.count++; rateMap.set(ip, entry)
  return entry.count <= 10
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const ip = getClientIp(request)
  if (!checkRate(ip)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { token } = await params
  const body = await request.json().catch(() => ({}))
  const sourceId: string = typeof body.sourceId === 'string' ? body.sourceId : ''
  if (!sourceId) return NextResponse.json({ error: 'sourceId required' }, { status: 400 })
  const verificationToken: string | undefined = typeof body.verificationToken === 'string' ? body.verificationToken : undefined

  const shippingRaw = body.shipping
  const requiredFields: (keyof ShippingAddress)[] = ['name', 'address1', 'city', 'state', 'zip', 'country']
  if (!shippingRaw || requiredFields.some(f => !shippingRaw[f])) {
    return NextResponse.json({ error: 'Shipping address required' }, { status: 400 })
  }
  const cleanShipping: ShippingAddress = {
    name:     sanitizeText(String(shippingRaw.name)).slice(0, 100),
    address1: sanitizeText(String(shippingRaw.address1)).slice(0, 200),
    address2: shippingRaw.address2 ? sanitizeText(String(shippingRaw.address2)).slice(0, 200) : undefined,
    city:     sanitizeText(String(shippingRaw.city)).slice(0, 100),
    state:    sanitizeText(String(shippingRaw.state)).slice(0, 100),
    zip:      sanitizeText(String(shippingRaw.zip)).slice(0, 20),
    country:  sanitizeText(String(shippingRaw.country)).slice(0, 10),
  }

  const supabase = createServiceRoleClient()

  // Validate token — all invalid states are 410
  const { data: sale, error: saleErr } = await supabase
    .from('private_sales')
    .select('id, expires_at, used_at, revoked_at, items:private_sale_items(product_id, quantity, custom_price)')
    .eq('token', token)
    .maybeSingle()
  if (saleErr) {
    console.error('[private-sale checkout] DB error on token lookup:', saleErr.message)
    return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 })
  }

  if (!sale || sale.used_at || sale.revoked_at) {
    return NextResponse.json({ error: 'This link is no longer available' }, { status: 410 })
  }
  if (new Date(sale.expires_at) <= new Date()) {
    const { error: releaseErr } = await supabase.rpc('release_private_sale_stock', { sale_id: sale.id })
    if (releaseErr) console.error('[private-sale checkout] release_private_sale_stock failed for sale_id:', sale.id, releaseErr.message)
    return NextResponse.json({ error: 'This link is no longer available' }, { status: 410 })
  }

  // Calculate totals
  const { data: settings } = await supabase.from('settings').select('shipping_mode,shipping_value').limit(1).maybeSingle()
  const subtotal = sale.items.reduce((sum: number, i: { custom_price: number; quantity: number }) => sum + i.custom_price * i.quantity, 0)
  const shippingCost = calculateShipping(subtotal, settings ?? { shipping_mode: 'fixed', shipping_value: 0 })
  const shippingCents = Math.round(shippingCost * 100)
  const totalCents = Math.round(subtotal * 100) + shippingCents

  // Create Square order
  let orderId = ''
  let paymentId = ''
  const { client, locationId } = await getSquareClient()

  try {
    const orderResult = await client.orders.create({
      order: {
        locationId,
        lineItems: [
          ...sale.items.map((item: { custom_price: number; quantity: number }) => ({
            name: 'Item (private sale)',
            quantity: String(item.quantity),
            basePriceMoney: { amount: BigInt(Math.round(item.custom_price * 100)), currency: 'USD' as const },
          })),
          ...(shippingCents > 0 ? [{ name: 'Shipping & Handling', quantity: '1', basePriceMoney: { amount: BigInt(shippingCents), currency: 'USD' as const } }] : []),
        ],
        fulfillments: [{
          type: 'SHIPMENT' as const,
          state: 'PROPOSED' as const,
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
      idempotencyKey: `order-${sale.id}-${sourceId.slice(-12)}`,
    })
    orderId = orderResult.order?.id ?? ''
    if (!orderId) throw new Error('Square order created but returned no ID')
  } catch (err) {
    const { message, detail } = squarePaymentError(err)
    console.error('[private-sale checkout] Square order creation error:', detail)
    return NextResponse.json({ error: message, detail }, { status: 402 })
  }

  // Charge the card
  try {
    const paymentResult = await client.payments.create({
      sourceId, orderId, locationId,
      amountMoney: { amount: BigInt(totalCents), currency: 'USD' as const },
      idempotencyKey: `pay-${sale.id}-${sourceId.slice(-12)}`,
      ...(verificationToken ? { verificationToken } : {}),
    })
    paymentId = paymentResult.payment?.id ?? ''
  } catch (err) {
    const { message, detail } = squarePaymentError(err)
    console.error('[private-sale checkout] Square payment error:', detail)
    return NextResponse.json({ error: message, detail }, { status: 402 })
  }

  // Fulfill atomically — refund if DB fails
  const { error: fulfillError } = await supabase.rpc('fulfill_private_sale', { sale_id: sale.id })
  if (fulfillError) {
    console.error('fulfill_private_sale failed after payment. paymentId:', paymentId, 'sale_id:', sale.id, fulfillError)
    let refunded = false
    try {
      await client.refunds.refundPayment({
        paymentId,
        idempotencyKey: `refund-${paymentId}`,
        amountMoney: { amount: BigInt(totalCents), currency: 'USD' as const },
        reason: 'Fulfillment error — automatic refund',
      })
      refunded = true
    } catch (refundErr) {
      console.error('Refund also failed. Manual intervention required. paymentId:', paymentId, refundErr)
    }
    const msg = refunded
      ? 'Order processing error — a refund has been issued to your card.'
      : 'Order processing error — please contact support immediately with your order details.'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  return NextResponse.json({ orderId, paymentId })
}
