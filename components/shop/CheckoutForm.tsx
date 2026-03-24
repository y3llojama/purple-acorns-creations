'use client'
import { useEffect, useRef, useState } from 'react'
import { useCart } from './CartContext'
import { useRouter } from 'next/navigation'
import { calculateShipping } from '@/lib/shipping'
import { runVerifyBuyer, type SquareCard, type SquarePayments } from '@/lib/square/buyer-verification'

export default function CheckoutForm({ onSuccess }: { onSuccess?: () => void }) {
  const { items, total, clearCart } = useCart()
  const router = useRouter()
  const cardRef = useRef<SquareCard | null>(null)
  const paymentsRef = useRef<SquarePayments | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sdkReady, setSdkReady] = useState(false)
  const [shipping, setShipping] = useState({
    name: '', address1: '', address2: '', city: '', state: '', zip: '', country: 'US',
  })
  const [shippingCost, setShippingCost] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/shop/shipping-config')
      .then(r => { if (!r.ok) throw new Error('fetch failed'); return r.json() })
      .then(d => setShippingCost(calculateShipping(total, d)))
      .catch(() => setShippingCost(0))
  }, [total])

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let cancelled = false
    let attempts = 0
    const MAX_ATTEMPTS = 20

    async function init() {
      if (cancelled) return
      if (!window.Square) {
        if (++attempts >= MAX_ATTEMPTS) { setError('Payment form failed to load. Please refresh and try again.'); return }
        timeoutId = setTimeout(init, 500)
        return
      }
      if (!containerRef.current) {
        if (++attempts >= MAX_ATTEMPTS) { setError('Payment form failed to load. Please refresh and try again.'); return }
        timeoutId = setTimeout(init, 500)
        return
      }
      const appId = process.env.NEXT_PUBLIC_SQUARE_APPLICATION_ID ?? ''
      const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID ?? ''
      const payments = await window.Square.payments(appId, locationId)
      if (cancelled) return
      paymentsRef.current = payments
      const card = await payments.card()
      if (cancelled) return
      await card.attach(containerRef.current)
      if (cancelled) return
      cardRef.current = card
      setSdkReady(true)
    }
    init()
    return () => { cancelled = true; if (timeoutId) clearTimeout(timeoutId) }
  }, [])

  function shippingField(field: keyof typeof shipping) {
    return {
      value: shipping[field],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
        setShipping(prev => ({ ...prev, [field]: e.target.value })),
      required: field !== 'address2',
      style: { width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: '4px', fontSize: '14px', marginBottom: '8px', minHeight: '48px', boxSizing: 'border-box' } as React.CSSProperties,
    }
  }

  async function handlePay() {
    if (!cardRef.current || !sdkReady) return
    setLoading(true); setError(null)
    try {
      const result = await cardRef.current.tokenize()
      if (result.status !== 'OK' || !result.token) {
        setError(result.errors?.[0]?.message ?? 'Card error — please try again')
        return
      }
      const sourceId = result.token

      let verificationToken: string | undefined
      if (paymentsRef.current) {
        const verify = await runVerifyBuyer(
          paymentsRef.current,
          sourceId,
          total + (shippingCost ?? 0),
          shipping.name,
          shipping.country,
        )
        if (verify.cancelled) {
          setError('Verification was cancelled. Please try again.')
          return
        }
        if (verify.error) {
          setError('Verification failed — please try again.')
          return
        }
        verificationToken = verify.verificationToken
      }

      const res = await fetch('/api/shop/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cart: items.map(i => ({ productId: i.product.id, quantity: i.quantity })),
          sourceId,
          verificationToken,
          shipping: {
            name: shipping.name,
            address1: shipping.address1,
            address2: shipping.address2 || undefined,
            city: shipping.city,
            state: shipping.state,
            zip: shipping.zip,
            country: shipping.country,
          },
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? 'Payment failed')
        return
      }
      const data = await res.json()
      onSuccess?.()
      router.push(`/shop/confirmation/${data.orderId}`)
      clearCart()
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '40px 24px' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', marginBottom: '24px' }}>Checkout</h2>
      <div style={{ marginBottom: '24px', padding: '16px', background: 'var(--color-surface)', borderRadius: '8px' }}>
        {items.map(item => (
          <div key={item.product.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
            <span>{item.product.name} × {item.quantity}</span>
            <span>${(item.product.price * item.quantity).toFixed(2)}</span>
          </div>
        ))}
        {shippingCost !== null && shippingCost > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
            <span>Shipping &amp; Handling</span>
            <span>${shippingCost.toFixed(2)}</span>
          </div>
        )}
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '8px', fontWeight: '600', display: 'flex', justifyContent: 'space-between' }}>
          <span>Total</span>
          <span>${(total + (shippingCost ?? 0)).toFixed(2)}</span>
        </div>
      </div>
      <div style={{ marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: 'var(--color-primary)' }}>Shipping Address</h3>
        <input placeholder="Full name" {...shippingField('name')} />
        <input placeholder="Address line 1" {...shippingField('address1')} />
        <input placeholder="Address line 2 (optional)" {...shippingField('address2')} required={false} />
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
          <input placeholder="City" {...shippingField('city')} />
          <input placeholder="State" {...shippingField('state')} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <input placeholder="ZIP code" {...shippingField('zip')} />
          <input placeholder="Country" {...shippingField('country')} />
        </div>
      </div>
      <div ref={containerRef} id="square-card-container" style={{ marginBottom: '24px', minHeight: '89px' }} />
      {error && <p role="alert" style={{ color: 'var(--color-error)', marginBottom: '16px', fontSize: '14px' }}>{error}</p>}
      <button
        onClick={handlePay}
        disabled={loading || !sdkReady}
        style={{ width: '100%', padding: '16px', background: 'var(--color-primary)', color: 'var(--color-accent)', border: 'none', borderRadius: '4px', fontSize: '18px', cursor: loading ? 'not-allowed' : 'pointer', minHeight: '48px', opacity: (!sdkReady || loading) ? 0.7 : 1 }}
      >
        {loading ? 'Processing...' : `Pay $${(total + (shippingCost ?? 0)).toFixed(2)}`}
      </button>
    </div>
  )
}
