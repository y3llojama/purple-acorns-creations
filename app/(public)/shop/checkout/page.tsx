'use client'
import { useEffect, useRef } from 'react'
import CheckoutForm from '@/components/shop/CheckoutForm'
import { useCart } from '@/components/shop/CartContext'
import { useRouter } from 'next/navigation'

export default function CheckoutPage() {
  const { items } = useCart()
  const router = useRouter()
  const paid = useRef(false)

  useEffect(() => {
    if (!items.length && !paid.current) router.replace('/shop')
  }, [items, router])

  if (!items.length && !paid.current) return null
  return <CheckoutForm onSuccess={() => { paid.current = true }} />
}
