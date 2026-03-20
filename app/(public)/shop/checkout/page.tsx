'use client'
import { useEffect } from 'react'
import CheckoutForm from '@/components/shop/CheckoutForm'
import { useCart } from '@/components/shop/CartContext'
import { useRouter } from 'next/navigation'

export default function CheckoutPage() {
  const { items } = useCart()
  const router = useRouter()

  useEffect(() => {
    if (!items.length) router.replace('/shop')
  }, [items, router])

  if (!items.length) return null
  return <CheckoutForm />
}
