'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { calculateShipping } from '@/lib/shipping'
import type { PrivateSaleItem, ShippingAddress } from '@/lib/supabase/types'
import { sanitizeText } from '@/lib/sanitize'
import { runVerifyBuyer, type SquareCard, type SquarePayments } from '@/lib/square/buyer-verification'

interface SaleData {
  items: PrivateSaleItem[]
  expiresAt: string
  shipping: { mode: 'fixed' | 'percentage'; value: number }
}

export default function PrivateSaleCheckout({ sale, token }: { sale: SaleData; token: string }) {
  const router = useRouter()
  const cardRef = useRef<SquareCard | null>(null)
  const paymentsRef = useRef<SquarePayments | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sdkReady, setSdkReady] = useState(false)
  const [shipping, setShipping] = useState<ShippingAddress>({
    name: '', address1: '', address2: '', city: '', state: '', zip: '', country: 'US',
  })
  const [timeLeft, setTimeLeft] = useState('')

  // Expiry countdown
  useEffect(() => {
    function update() {
      const diff = new Date(sale.expiresAt).getTime() - Date.now()
      if (diff <= 0) { setTimeLeft('Expired'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      setTimeLeft(h > 0 ? `${h}h ${m}m remaining` : `${m}m remaining`)
    }
    update()
    const id = setInterval(update, 60000)
    return () => clearInterval(id)
  }, [sale.expiresAt])

  // Square SDK init
  useEffect(() => {
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let attempts = 0
    const MAX_ATTEMPTS = 20

    async function init() {
      if (cancelled) return
      if (!window.Square) {
        if (++attempts >= MAX_ATTEMPTS) { setError('Payment form failed to load. Please refresh.'); return }
        timeoutId = setTimeout(init, 500); return
      }
      if (!containerRef.current) {
        if (++attempts >= MAX_ATTEMPTS) { setError('Payment form failed to load. Please refresh.'); return }
        timeoutId = setTimeout(init, 500); return
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
      cardRef.current = card; setSdkReady(true)
    }
    init()
    return () => { cancelled = true; if (timeoutId) clearTimeout(timeoutId) }
  }, [])

  const subtotal = sale.items.reduce((sum, item) => sum + (item.custom_price ?? 0) * item.quantity, 0)
  const shippingCost = calculateShipping(subtotal, { shipping_mode: sale.shipping.mode, shipping_value: sale.shipping.value })

  const fieldStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: '4px', fontSize: '14px', marginBottom: '8px', minHeight: '48px', boxSizing: 'border-box' }
  const srOnly: React.CSSProperties = { position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }

  function shippingInput(field: keyof ShippingAddress, label: string, required = true) {
    const id = `ps-shipping-${field}`
    return (
      <div>
        <label htmlFor={id} style={srOnly}>{label}</label>
        <input
          id={id}
          placeholder={label + (required ? '' : ' (optional)')}
          value={shipping[field] ?? ''}
          onChange={e => setShipping(prev => ({ ...prev, [field]: e.target.value }))}
          required={required}
          aria-required={required}
          style={fieldStyle}
        />
      </div>
    )
  }

  async function handlePay() {
    if (!cardRef.current || !sdkReady) return
    const requiredFields: (keyof ShippingAddress)[] = ['name', 'address1', 'city', 'state', 'zip', 'country']
    if (requiredFields.some(f => !shipping[f])) { setError('Please fill in all shipping fields'); return }
    setLoading(true); setError(null)
    try {
      const result = await cardRef.current.tokenize()
      if (result.status !== 'OK' || !result.token) {
        setError(result.errors?.[0]?.message ?? 'Card error — please try again'); return
      }
      const sourceId = result.token

      let verificationToken: string | undefined
      if (paymentsRef.current) {
        const total = subtotal + shippingCost
        const verify = await runVerifyBuyer(paymentsRef.current, sourceId, total, shipping.name, shipping.country)
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

      const res = await fetch(`/api/shop/private-sale/${token}/checkout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId, verificationToken, shipping }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? 'Payment failed'); return
      }
      const data = await res.json()
      router.push(`/shop/confirmation/${data.orderId}`)
    } catch {
      setError('Something went wrong. Please try again or contact us if the problem persists.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '520px', margin: '0 auto', padding: '40px 24px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', marginBottom: '8px' }}>Your Private Sale</h1>
      {timeLeft && <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '24px' }}>Link expires: {timeLeft}</p>}

      {/* Items */}
      <div style={{ marginBottom: '24px', padding: '16px', background: 'var(--color-surface)', borderRadius: '8px' }}>
        {sale.items.map((item, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
            <span>{sanitizeText(item.product?.name ?? 'Item')} × {item.quantity}</span>
            <span>${((item.custom_price ?? 0) * item.quantity).toFixed(2)}</span>
          </div>
        ))}
        {shippingCost > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
            <span>Shipping &amp; Handling</span>
            <span>${shippingCost.toFixed(2)}</span>
          </div>
        )}
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '8px', fontWeight: '600', display: 'flex', justifyContent: 'space-between' }}>
          <span>Total</span><span>${(subtotal + shippingCost).toFixed(2)}</span>
        </div>
      </div>

      {/* Shipping address */}
      <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: 'var(--color-primary)' }}>Shipping Address</h2>
      {shippingInput('name', 'Full name')}
      {shippingInput('address1', 'Address line 1')}
      {shippingInput('address2', 'Address line 2', false)}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
        {shippingInput('city', 'City')}
        {shippingInput('state', 'State')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {shippingInput('zip', 'ZIP code')}
        <div>
          <label htmlFor="ps-shipping-country" style={srOnly}>Country</label>
          <select
            id="ps-shipping-country"
            value={shipping.country}
            onChange={e => setShipping(prev => ({ ...prev, country: e.target.value }))}
            required
            aria-required
            style={fieldStyle}
          >
            <option value="US">United States</option>
            <option value="CA">Canada</option>
            <option value="GB">United Kingdom</option>
            <option value="AU">Australia</option>
            <option value="DE">Germany</option>
            <option value="FR">France</option>
            <option value="JP">Japan</option>
            <option value="MX">Mexico</option>
            <option value="IT">Italy</option>
            <option value="ES">Spain</option>
            <option value="NL">Netherlands</option>
            <option value="SE">Sweden</option>
            <option value="NZ">New Zealand</option>
            <option value="IE">Ireland</option>
          </select>
        </div>
      </div>

      {/* Square card widget */}
      <div ref={containerRef} id="square-card-container-private" style={{ marginBottom: '16px', minHeight: '89px', marginTop: '24px' }} />
      {error && <p role="alert" style={{ color: 'var(--color-error)', marginBottom: '16px', fontSize: '14px' }}>{error}</p>}
      <button
        onClick={handlePay}
        disabled={loading || !sdkReady}
        style={{ width: '100%', padding: '16px', background: 'var(--color-primary)', color: 'var(--color-accent)', border: 'none', borderRadius: '4px', fontSize: '18px', cursor: loading ? 'not-allowed' : 'pointer', minHeight: '48px', opacity: (!sdkReady || loading) ? 0.7 : 1 }}
      >
        {loading ? 'Processing...' : `Pay $${(subtotal + shippingCost).toFixed(2)}`}
      </button>
    </div>
  )
}
