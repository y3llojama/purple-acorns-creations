'use client'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { Product } from '@/lib/supabase/types'

export interface CartItem { product: Product; quantity: number }

interface CartContextValue {
  items: CartItem[]
  addToCart: (product: Product) => void
  removeFromCart: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  total: number
  count: number
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}

const CartContext = createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // Load from localStorage after mount (avoids SSR/hydration mismatch)
  useEffect(() => {
    try { const s = localStorage.getItem('pac_cart'); if (s) setItems(JSON.parse(s)) } catch {}
    setHydrated(true)
  }, [])

  // Only persist after hydration to prevent overwriting stored cart with empty initial state
  useEffect(() => {
    if (!hydrated) return
    try { localStorage.setItem('pac_cart', JSON.stringify(items)) } catch {}
  }, [items, hydrated])

  const addToCart = useCallback((product: Product) => {
    setItems(prev => {
      const ex = prev.find(i => i.product.id === product.id)
      return ex ? prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i)
                : [...prev, { product, quantity: 1 }]
    })
    setIsOpen(true)
  }, [])

  const removeFromCart = useCallback((productId: string) => setItems(prev => prev.filter(i => i.product.id !== productId)), [])

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) { removeFromCart(productId); return }
    setItems(prev => prev.map(i => i.product.id === productId ? { ...i, quantity } : i))
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
