'use client'
import { useState } from 'react'

interface Props {
  initialShippingMode: 'fixed' | 'percentage'
  initialShippingValue: string
}

export default function ShippingEditor({ initialShippingMode, initialShippingValue }: Props) {
  const [shippingMode, setShippingMode] = useState<'fixed' | 'percentage'>(initialShippingMode)
  const [shippingValue, setShippingValue] = useState(initialShippingValue)

  async function saveShipping() {
    const res = await fetch('/api/admin/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipping_mode: shippingMode, shipping_value: parseFloat(shippingValue) || 0 }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert((data as { error?: string }).error ?? 'Failed to save shipping')
    }
  }

  return (
    <div style={{ padding: '32px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '32px', color: 'var(--color-primary)' }}>
        Settings
      </h1>

      {/* Shipping */}
      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: 'var(--color-primary)' }}>
          Shipping &amp; Handling
        </h2>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>
              Mode
            </label>
            <select
              value={shippingMode}
              onChange={e => setShippingMode(e.target.value as 'fixed' | 'percentage')}
              style={{ padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: '4px', fontSize: '14px', minHeight: '48px' }}
            >
              <option value="fixed">Fixed fee per order ($)</option>
              <option value="percentage">Percentage of subtotal (%)</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500' }}>
              {shippingMode === 'fixed' ? 'Amount ($)' : 'Percentage (%)'}
            </label>
            <input
              type="number" min="0" step="0.01"
              value={shippingValue}
              onChange={e => setShippingValue(e.target.value)}
              style={{ padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: '4px', fontSize: '14px', width: '120px', minHeight: '48px' }}
            />
          </div>
          <button
            onClick={saveShipping}
            style={{ padding: '10px 20px', background: 'var(--color-primary)', color: 'var(--color-accent)', border: 'none', borderRadius: '4px', fontSize: '14px', cursor: 'pointer', minHeight: '48px' }}
          >
            Save Shipping
          </button>
        </div>
        <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-muted)' }}>
          Set to $0 / 0% to offer free shipping. Applies to all orders (shop checkout and private sale links).
        </p>
      </section>
    </div>
  )
}
