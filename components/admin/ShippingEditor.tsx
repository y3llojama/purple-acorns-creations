'use client'
import { useState } from 'react'

type ShippingMode = 'fixed' | 'percentage'

interface TierConfig {
  mode: ShippingMode
  value: string
}

interface Props {
  initialDomestic: TierConfig
  initialCanadaMexico: TierConfig
  initialIntl: TierConfig
}

function TierRow({ label, tier, onChange }: {
  label: string
  tier: TierConfig
  onChange: (t: TierConfig) => void
}) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <h3 style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px', color: 'var(--color-text)' }}>
        {label}
      </h3>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>
            Mode
          </label>
          <select
            value={tier.mode}
            onChange={e => onChange({ ...tier, mode: e.target.value as ShippingMode })}
            style={{ padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: '4px', fontSize: '14px', minHeight: '48px' }}
          >
            <option value="fixed">Fixed fee per order ($)</option>
            <option value="percentage">Percentage of subtotal (%)</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: '500' }}>
            {tier.mode === 'fixed' ? 'Amount ($)' : 'Percentage (%)'}
          </label>
          <input
            type="number" min="0" step="0.01"
            value={tier.value}
            onChange={e => onChange({ ...tier, value: e.target.value })}
            style={{ padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: '4px', fontSize: '14px', width: '120px', minHeight: '48px' }}
          />
        </div>
      </div>
    </div>
  )
}

export default function ShippingEditor({ initialDomestic, initialCanadaMexico, initialIntl }: Props) {
  const [domestic, setDomestic] = useState(initialDomestic)
  const [canadaMexico, setCanadaMexico] = useState(initialCanadaMexico)
  const [intl, setIntl] = useState(initialIntl)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  async function saveShipping() {
    setStatus('saving')
    const res = await fetch('/api/admin/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shipping_mode: domestic.mode,
        shipping_value: parseFloat(domestic.value) || 0,
        shipping_mode_canada_mexico: canadaMexico.mode,
        shipping_value_canada_mexico: parseFloat(canadaMexico.value) || 0,
        shipping_mode_intl: intl.mode,
        shipping_value_intl: parseFloat(intl.value) || 0,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert((data as { error?: string }).error ?? 'Failed to save shipping')
      setStatus('idle')
      return
    }
    setStatus('saved')
    setTimeout(() => setStatus('idle'), 3000)
  }

  return (
    <div style={{ padding: '32px' }}>
      <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '32px', color: 'var(--color-primary)' }}>
        Settings
      </h1>

      <section style={{ marginBottom: '40px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '16px', color: 'var(--color-primary)' }}>
          Shipping &amp; Handling
        </h2>

        <TierRow label="US Domestic" tier={domestic} onChange={setDomestic} />
        <TierRow label="Canada &amp; Mexico" tier={canadaMexico} onChange={setCanadaMexico} />
        <TierRow label="International" tier={intl} onChange={setIntl} />

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '8px' }}>
          <button
            onClick={saveShipping}
            disabled={status === 'saving'}
            style={{ padding: '10px 20px', background: 'var(--color-primary)', color: 'var(--color-accent)', border: 'none', borderRadius: '4px', fontSize: '14px', cursor: status === 'saving' ? 'not-allowed' : 'pointer', minHeight: '48px', opacity: status === 'saving' ? 0.7 : 1 }}
          >
            {status === 'saving' ? 'Saving...' : 'Save Shipping'}
          </button>
          {status === 'saved' && (
            <span style={{ fontSize: '13px', color: 'var(--color-success, green)' }}>Saved</span>
          )}
        </div>
        <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-muted)' }}>
          Set to $0 / 0% to offer free shipping for a tier. Tier is selected based on the shipping country code entered at checkout.
        </p>
      </section>
    </div>
  )
}
