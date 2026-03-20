'use client'
import CheckoutForm from '@/components/shop/CheckoutForm'
import { useCart } from '@/components/shop/CartContext'
import Link from 'next/link'

export default function CheckoutPage() {
  const { items } = useCart()
  if (!items.length) return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '24px' }}>Your cart is empty.</p>
      <Link href="/shop" style={{ color: 'var(--color-primary)' }}>Browse the shop →</Link>
    </div>
  )
  return <CheckoutForm />
}
