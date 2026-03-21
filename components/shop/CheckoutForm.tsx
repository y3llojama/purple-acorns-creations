'use client'
import { useEffect, useRef, useState } from 'react'
import { useCart } from './CartContext'
import { useRouter } from 'next/navigation'

interface SquareCard {
  attach: (container: HTMLElement) => Promise<void>
  tokenize: () => Promise<{ status: string; token?: string; errors?: Array<{ message: string }> }>
}
interface SquarePayments {
  card: () => Promise<SquareCard>
}
declare global {
  interface Window {
    Square?: { payments: (appId: string, locationId: string) => Promise<SquarePayments> }
  }
}

export default function CheckoutForm() {
  const { items, total, clearCart } = useCart()
  const router = useRouter()
  const cardRef = useRef<SquareCard | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sdkReady, setSdkReady] = useState(false)

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let cancelled = false
    let attempts = 0
    const MAX_ATTEMPTS = 20 // 10 seconds at 500ms intervals

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

  async function handlePay() {
    if (!cardRef.current || !sdkReady) return
    setLoading(true); setError(null)
    try {
      const result = await cardRef.current.tokenize()
      if (result.status !== 'OK' || !result.token) {
        setError(result.errors?.[0]?.message ?? 'Card error — please try again')
        return
      }
      const res = await fetch('/api/shop/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cart: items.map(i => ({ productId: i.product.id, quantity: i.quantity })),
          sourceId: result.token,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(`${data.error ?? 'Payment failed'}${data.detail ? ` — ${data.detail}` : ''}`); return }
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
        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '8px', fontWeight: '600', display: 'flex', justifyContent: 'space-between' }}>
          <span>Total</span><span>${total.toFixed(2)}</span>
        </div>
      </div>
      <div ref={containerRef} id="square-card-container" style={{ marginBottom: '24px', minHeight: '89px' }} />
      {error && <p role="alert" style={{ color: 'var(--color-error)', marginBottom: '16px', fontSize: '14px' }}>{error}</p>}
      <button
        onClick={handlePay}
        disabled={loading || !sdkReady}
        style={{ width: '100%', padding: '16px', background: 'var(--color-primary)', color: 'var(--color-accent)', border: 'none', borderRadius: '4px', fontSize: '18px', cursor: loading ? 'not-allowed' : 'pointer', minHeight: '48px', opacity: (!sdkReady || loading) ? 0.7 : 1 }}
      >
        {loading ? 'Processing...' : `Pay $${total.toFixed(2)}`}
      </button>
    </div>
  )
}
