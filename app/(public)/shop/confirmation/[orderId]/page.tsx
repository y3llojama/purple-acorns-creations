import { notFound } from 'next/navigation'

// Square order IDs are base62 alphanumeric, typically 25-30 chars
const SQUARE_ORDER_ID_RE = /^[A-Za-z0-9]{10,50}$/

export default async function ConfirmationPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  if (!SQUARE_ORDER_ID_RE.test(orderId)) notFound()

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', marginBottom: '24px' }}>Order Confirmed!</h1>
      <p style={{ fontSize: '18px', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
        Thank you for your order. You&apos;ll receive a confirmation from Square shortly.
      </p>
      <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '40px' }}>Order: {orderId}</p>
      <a href="/shop" style={{ display: 'inline-block', padding: '14px 32px', background: 'var(--color-primary)', color: 'var(--color-accent)', borderRadius: '4px', textDecoration: 'none', fontSize: '16px' }}>
        Continue Shopping
      </a>
    </div>
  )
}
