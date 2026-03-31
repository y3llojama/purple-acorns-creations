'use client'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { Product } from '@/lib/supabase/types'

export interface CartItem { product: Product; quantity: number; variationId?: string }

interface CartContextValue {
  items: CartItem[]
  addToCart: (product: Product, variationId?: string) => void
  removeFromCart: (productId: string, variationId?: string) => void
  updateQuantity: (productId: string, quantity: number, variationId?: string) => void
  clearCart: () => void
  total: number
  count: number
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}

const CartContext = createContext<CartContextValue | null>(null)

function cartKey(item: { product: { id: string }; variationId?: string }): string {
  return item.variationId ? `${item.product.id}:${item.variationId}` : item.product.id
}

function matchItem(productId: string, variationId?: string) {
  return (i: CartItem) => {
    if (variationId) return i.product.id === productId && i.variationId === variationId
    return i.product.id === productId
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // Load from localStorage after mount — migrate old format (no variationId)
  useEffect(() => {
    try {
      const s = localStorage.getItem('pac_cart')
      if (s) {
        const parsed = JSON.parse(s) as CartItem[]
        setItems(parsed)
      }
    } catch {}
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try { localStorage.setItem('pac_cart', JSON.stringify(items)) } catch {}
  }, [items, hydrated])

  const addToCart = useCallback((product: Product, variationId?: string) => {
    setItems(prev => {
      const ex = prev.find(matchItem(product.id, variationId))
      if (ex) {
        return prev.map(i => matchItem(product.id, variationId)(i)
          ? { ...i, quantity: i.quantity + 1 }
          : i)
      }
      return [...prev, { product, quantity: 1, variationId }]
    })
    setIsOpen(true)
  }, [])

  const removeFromCart = useCallback((productId: string, variationId?: string) =>
    setItems(prev => prev.filter(i => !matchItem(productId, variationId)(i))), [])

  const updateQuantity = useCallback((productId: string, quantity: number, variationId?: string) => {
    if (quantity <= 0) { removeFromCart(productId, variationId); return }
    setItems(prev => prev.map(i => matchItem(productId, variationId)(i) ? { ...i, quantity } : i))
  }, [removeFromCart])

  const clearCart = useCallback(() => setItems([]), [])
  const total = items.reduce((s, i) => s + i.product.price * i.quantity, 0)
  const count = items.reduce((s, i) => s + i.quantity, 0)

  return (
    <CartContext.Provider value={{ items, addToCart, removeFromCart, updateQuantity, clearCart, total, count, isOpen, setIsOpen }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
