'use client'
import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { useCart } from './CartContext'
import { isValidHttpsUrl } from '@/lib/validate'

export default function CartDrawer() {
  const { items, removeFromCart, updateQuantity, total, count, isOpen, setIsOpen } = useCart()
  const drawerRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    previousFocusRef.current = document.activeElement as HTMLElement

    // Focus first focusable element in drawer
    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    if (focusable && focusable.length > 0) {
      focusable[0].focus()
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false)
        return
      }
      if (e.key !== 'Tab') return

      const focusableEls = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter(el => !el.hasAttribute('disabled'))

      if (focusableEls.length === 0) return
      const first = focusableEls[0]
      const last = focusableEls[focusableEls.length - 1]

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, setIsOpen])

  // Restore focus on close
  useEffect(() => {
    if (!isOpen && previousFocusRef.current) {
      previousFocusRef.current.focus()
      previousFocusRef.current = null
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <>
      {/* Overlay */}
      <div
        role="presentation"
        onClick={() => setIsOpen(false)}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--color-overlay)',
          zIndex: 900,
        }}
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 'min(400px, 100vw)',
          height: '100vh',
          background: 'var(--color-bg)',
          borderLeft: '1px solid var(--color-border)',
          zIndex: 901,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-4px 0 24px var(--color-shadow-drawer)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.125rem', color: 'var(--color-text)' }}>
            Shopping Cart {count > 0 && <span style={{ color: 'var(--color-text-muted)', fontWeight: 'normal' }}>({count})</span>}
          </h2>
          <button
            onClick={() => setIsOpen(false)}
            aria-label="Close cart"
            style={{
              minWidth: '48px',
              minHeight: '48px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.5rem',
              color: 'var(--color-text)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: '48px' }}>
              <p style={{ color: 'var(--color-text-muted)', marginBottom: '16px' }}>
                Your cart is empty.{' '}
                <Link
                  href="/shop"
                  onClick={() => setIsOpen(false)}
                  style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}
                >
                  Browse the shop →
                </Link>
              </p>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {items.map(({ product, quantity }) => {
                const imgSrc = product.images?.[0] && isValidHttpsUrl(product.images[0])
                  ? product.images[0]
                  : null

                return (
                  <li
                    key={product.id}
                    style={{
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'flex-start',
                      paddingBottom: '16px',
                      borderBottom: '1px solid var(--color-border)',
                    }}
                  >
                    {/* Thumbnail */}
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        flexShrink: 0,
                        background: 'var(--color-surface)',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      {imgSrc ? (
                        <img
                          src={imgSrc}
                          alt={product.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div
                          aria-hidden="true"
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--color-text-muted)',
                            fontSize: '0.75rem',
                          }}
                        >
                          ?
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          margin: '0 0 4px',
                          fontSize: '0.9rem',
                          color: 'var(--color-text)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {product.name}
                      </p>
                      <p style={{ margin: '0 0 8px', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                        ${product.price.toFixed(2)}
                      </p>

                      {/* Quantity adjuster */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button
                          onClick={() => updateQuantity(product.id, quantity - 1)}
                          aria-label={`Decrease quantity of ${product.name}`}
                          style={{
                            minWidth: '48px',
                            minHeight: '48px',
                            background: 'var(--color-surface)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '1.125rem',
                            color: 'var(--color-text)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          −
                        </button>
                        <span
                          style={{
                            minWidth: '32px',
                            textAlign: 'center',
                            fontSize: '0.9rem',
                            color: 'var(--color-text)',
                          }}
                        >
                          {quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(product.id, quantity + 1)}
                          aria-label={`Increase quantity of ${product.name}`}
                          style={{
                            minWidth: '48px',
                            minHeight: '48px',
                            background: 'var(--color-surface)',
                            border: '1px solid var(--color-border)',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '1.125rem',
                            color: 'var(--color-text)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Remove button */}
                    <button
                      onClick={() => removeFromCart(product.id)}
                      aria-label={`Remove ${product.name} from cart`}
                      style={{
                        minWidth: '48px',
                        minHeight: '48px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '1.25rem',
                        color: 'var(--color-text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        borderRadius: '4px',
                      }}
                    >
                      ×
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer with total and checkout */}
        {items.length > 0 && (
          <div
            style={{
              padding: '16px 20px',
              borderTop: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '1rem',
                fontWeight: 600,
                color: 'var(--color-text)',
              }}
            >
              <span>Total</span>
              <span>${total.toFixed(2)}</span>
            </div>
            <Link
              href="/shop/checkout"
              onClick={() => setIsOpen(false)}
              style={{
                display: 'block',
                minHeight: '48px',
                background: 'var(--color-primary)',
                color: 'var(--color-bg)',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 600,
                textDecoration: 'none',
                textAlign: 'center',
                lineHeight: '48px',
              }}
            >
              Checkout
            </Link>
          </div>
        )}
      </div>
    </>
  )
}
