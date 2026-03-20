'use client'
import { ShoppingBag } from 'lucide-react'
import { useCart } from './CartContext'

export default function CartButton() {
  const { count, setIsOpen } = useCart()

  return (
    <button
      onClick={() => setIsOpen(true)}
      aria-label={count > 0 ? `Shopping cart, ${count} item${count === 1 ? '' : 's'}` : 'Shopping cart'}
      style={{
        position: 'relative',
        minWidth: '48px',
        minHeight: '48px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--color-text)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '4px',
        padding: '8px',
      }}
    >
      <ShoppingBag size={24} aria-hidden="true" />
      {count > 0 && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            minWidth: '18px',
            height: '18px',
            background: 'var(--color-primary)',
            color: 'var(--color-bg)',
            borderRadius: '9px',
            fontSize: '0.7rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px',
            lineHeight: 1,
          }}
        >
          {count}
        </span>
      )}
    </button>
  )
}
