'use client'
import { useState, useEffect, useCallback } from 'react'
import ConfirmDialog from './ConfirmDialog'
import type { ItemOption, ItemOptionValue, ProductVariation } from '@/lib/supabase/types'

interface OptionWithValues extends ItemOption {
  values: ItemOptionValue[]
}

interface VariationRow {
  id?: string
  optionValueIds: string[]
  optionLabels: string[]
  price: number
  sku: string
  stockCount: number
  isActive: boolean
  isDefault: boolean
}

interface Props {
  productId: string
  productPrice: number
  onDirtyChange: (dirty: boolean) => void
}

const inputStyle: React.CSSProperties = {
  padding: '8px', fontSize: '16px', borderRadius: '4px',
  border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'inherit',
}
const chipStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '4px',
  padding: '4px 10px', borderRadius: '16px', fontSize: '14px',
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
}
const btnSmall: React.CSSProperties = {
  padding: '6px 12px', fontSize: '14px', borderRadius: '4px',
  border: '1px solid var(--color-border)', background: 'transparent',
  color: 'inherit', cursor: 'pointer', minHeight: '48px',
}

export default function VariationsEditor({ productId, productPrice, onDirtyChange }: Props) {
  const [allOptions, setAllOptions] = useState<OptionWithValues[]>([])
  const [attachedOptions, setAttachedOptions] = useState<OptionWithValues[]>([])
  const [variations, setVariations] = useState<VariationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [newValueInputs, setNewValueInputs] = useState<Record<string, string>>({})
  const [confirmRemoveOption, setConfirmRemoveOption] = useState<string | null>(null)
  const [bulkPrice, setBulkPrice] = useState('')

  const markDirty = useCallback(() => {
    if (!dirty) { setDirty(true); onDirtyChange(true) }
  }, [dirty, onDirtyChange])

  // Fetch existing options + current product variations
  useEffect(() => {
    async function load() {
      setLoading(true)
      const [optRes, varRes] = await Promise.all([
        fetch('/api/admin/options'),
        fetch(`/api/admin/inventory/${productId}/variations`),
      ])
      if (optRes.ok) {
        const opts = await optRes.json()
        setAllOptions(opts)
      }
      if (varRes.ok) {
        const { options, variations: vars } = await varRes.json()
        // Reconstruct attached options from product_options response
        const attached: OptionWithValues[] = options.map((po: { option: OptionWithValues }) => po.option)
        setAttachedOptions(attached)
        // Reconstruct variation rows
        const rows: VariationRow[] = vars.map((v: ProductVariation & { option_values?: { option_value_id: string }[] }) => ({
          id: v.id,
          optionValueIds: (v.option_values ?? []).map((ov: { option_value_id: string }) => ov.option_value_id),
          optionLabels: [], // Will be computed from attached options
          price: v.price,
          sku: v.sku ?? '',
          stockCount: v.stock_count,
          isActive: v.is_active,
          isDefault: v.is_default,
        }))
        setVariations(rows)
      }
      setLoading(false)
    }
    load()
  }, [productId])

  // Generate all combinations from attached options
  function generateCombinations(options: OptionWithValues[]): VariationRow[] {
    if (options.length === 0) return []
    const valueSets = options.map(o => o.values.filter(v => v.name))
    if (valueSets.some(vs => vs.length === 0)) return []

    function cross(sets: ItemOptionValue[][], prefix: ItemOptionValue[] = []): ItemOptionValue[][] {
      if (sets.length === 0) return [prefix]
      const [first, ...rest] = sets
      return first.flatMap(v => cross(rest, [...prefix, v]))
    }

    return cross(valueSets).map(combo => ({
      optionValueIds: combo.map(v => v.id),
      optionLabels: combo.map(v => v.name),
      price: productPrice,
      sku: '',
      stockCount: 0,
      isActive: true,
      isDefault: false,
    }))
  }

  function handleAttachOption(optionId: string) {
    const opt = allOptions.find(o => o.id === optionId)
    if (!opt || attachedOptions.some(a => a.id === opt.id)) return
    const newAttached = [...attachedOptions, opt]
    setAttachedOptions(newAttached)
    // Regenerate variations preserving existing ones
    const newCombos = generateCombinations(newAttached)
    const existingKeys = new Set(variations.map(v => v.optionValueIds.sort().join(',')))
    const added = newCombos.filter(c => !existingKeys.has(c.optionValueIds.sort().join(',')))
    setVariations([...variations, ...added])
    markDirty()
  }

  function handleRemoveOption(optionId: string) {
    setConfirmRemoveOption(optionId)
  }

  function confirmRemove() {
    if (!confirmRemoveOption) return
    const newAttached = attachedOptions.filter(o => o.id !== confirmRemoveOption)
    setAttachedOptions(newAttached)
    // Remove variations that used values from this option
    const removedOption = attachedOptions.find(o => o.id === confirmRemoveOption)
    const removedValueIds = new Set(removedOption?.values.map(v => v.id) ?? [])
    setVariations(variations.filter(v => !v.optionValueIds.some(id => removedValueIds.has(id))))
    setConfirmRemoveOption(null)
    markDirty()
  }

  function handleAddValue(optionId: string) {
    const input = newValueInputs[optionId]?.trim()
    if (!input) return
    const opt = attachedOptions.find(o => o.id === optionId)
    if (!opt) return
    const newValue: ItemOptionValue = {
      id: `temp-${Date.now()}-${Math.random()}`,
      option_id: optionId, name: input, sort_order: opt.values.length,
      square_option_value_id: null, created_at: '', updated_at: '',
    }
    const updatedOpt = { ...opt, values: [...opt.values, newValue] }
    setAttachedOptions(attachedOptions.map(o => o.id === optionId ? updatedOpt : o))
    setNewValueInputs({ ...newValueInputs, [optionId]: '' })
    // Add new combination rows
    const newAttached = attachedOptions.map(o => o.id === optionId ? updatedOpt : o)
    const allCombos = generateCombinations(newAttached)
    const existingKeys = new Set(variations.map(v => v.optionValueIds.sort().join(',')))
    const added = allCombos.filter(c => !existingKeys.has(c.optionValueIds.sort().join(',')))
    if (added.length > 0) setVariations([...variations, ...added])
    markDirty()
  }

  function updateVariation(index: number, field: keyof VariationRow, value: unknown) {
    setVariations(variations.map((v, i) => i === index ? { ...v, [field]: value } : v))
    markDirty()
  }

  function handleBulkPrice() {
    const p = parseFloat(bulkPrice)
    if (!Number.isFinite(p) || p <= 0) return
    setVariations(variations.map(v => ({ ...v, price: p })))
    setBulkPrice('')
    markDirty()
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    const payload = {
      options: attachedOptions.map(o => ({
        id: o.id.startsWith('temp-') ? undefined : o.id,
        name: o.name,
        values: o.values.map(v => ({
          id: v.id.startsWith('temp-') ? undefined : v.id,
          name: v.name,
          sort_order: v.sort_order,
        })),
      })),
      variations: variations.filter(v => v.isActive || v.id).map(v => ({
        id: v.id,
        option_value_ids: v.optionValueIds.map(id => id.startsWith('temp-') ? undefined : id).filter(Boolean),
        price: v.price,
        sku: v.sku || undefined,
        is_active: v.isActive,
      })),
    }
    const res = await fetch(`/api/admin/inventory/${productId}/variations`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Failed to save')
    } else {
      setDirty(false)
      onDirtyChange(false)
    }
    setSaving(false)
  }

  // Compute combination preview count
  const previewCount = generateCombinations(attachedOptions).length

  if (loading) return <div style={{ padding: '16px', color: 'var(--color-text-muted)' }}>Loading variations...</div>

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  return (
    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '16px', marginTop: '16px' }}>
      <h3 style={{ margin: '0 0 12px', fontSize: '16px' }}>Product Options & Variations</h3>

      {/* Option picker */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px', fontWeight: '500' }}>
          Attach Option
        </label>
        <select
          style={{ ...inputStyle, width: '100%', minHeight: '48px' }}
          value=""
          onChange={e => { if (e.target.value) handleAttachOption(e.target.value) }}
        >
          <option value="">Select an option...</option>
          {allOptions.filter(o => !attachedOptions.some(a => a.id === o.id)).map(o => (
            <option key={o.id} value={o.id}>{o.name} ({o.values.length} values)</option>
          ))}
        </select>
      </div>

      {/* Attached options with chip-based values */}
      {attachedOptions.map(opt => (
        <div key={opt.id} style={{ marginBottom: '16px', padding: '12px', background: 'var(--color-surface)', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <strong>{opt.name}</strong>
            <button style={{ ...btnSmall, color: 'var(--color-error)' }} onClick={() => handleRemoveOption(opt.id)}>
              Remove
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
            {opt.values.map(v => (
              <span key={v.id} style={chipStyle}>
                {v.name}
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', fontSize: '14px', lineHeight: 1 }}
                  onClick={() => {
                    const updatedOpt = { ...opt, values: opt.values.filter(val => val.id !== v.id) }
                    setAttachedOptions(attachedOptions.map(o => o.id === opt.id ? updatedOpt : o))
                    markDirty()
                  }}
                  aria-label={`Remove ${v.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              style={{ ...inputStyle, flex: 1, minHeight: '48px' }}
              placeholder={`e.g., "Small"`}
              value={newValueInputs[opt.id] ?? ''}
              onChange={e => setNewValueInputs({ ...newValueInputs, [opt.id]: e.target.value })}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddValue(opt.id) } }}
            />
            <button style={{ ...btnSmall }} onClick={() => handleAddValue(opt.id)}>Add</button>
          </div>
        </div>
      ))}

      {/* Combination preview */}
      {attachedOptions.length > 0 && (
        <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
          {previewCount} variation{previewCount !== 1 ? 's' : ''} ({attachedOptions.map(o => o.name).join(' × ')})
        </p>
      )}

      {/* Bulk actions */}
      {variations.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <input
            style={{ ...inputStyle, width: '120px', minHeight: '48px' }}
            type="number" step="0.01" min="0.01" placeholder="Price"
            value={bulkPrice}
            onChange={e => setBulkPrice(e.target.value)}
          />
          <button style={btnSmall} onClick={handleBulkPrice}>Set all prices</button>
          <button
            style={btnSmall}
            onClick={() => { setVariations(variations.map(v => ({ ...v, isActive: true }))); markDirty() }}
          >
            Activate all
          </button>
          <button
            style={btnSmall}
            onClick={() => { setVariations(variations.map(v => ({ ...v, isActive: false }))); markDirty() }}
          >
            Deactivate all
          </button>
        </div>
      )}

      {/* Variations list -- card layout on mobile, table on desktop */}
      {variations.length > 0 && (
        isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {variations.map((v, i) => (
              <div key={v.id ?? i} style={{
                padding: '12px', borderRadius: '8px',
                border: `1px solid ${v.isActive ? 'var(--color-border)' : 'var(--color-error)'}`,
                opacity: v.isActive ? 1 : 0.6,
              }}>
                <div style={{ fontWeight: '500', marginBottom: '8px' }}>{v.optionLabels.join(' / ') || 'Default'}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '14px' }}>
                    Price
                    <input
                      style={{ ...inputStyle, width: '100%', minHeight: '48px' }}
                      type="number" step="0.01" min="0.01"
                      value={v.price}
                      onChange={e => updateVariation(i, 'price', parseFloat(e.target.value) || 0)}
                    />
                  </label>
                  <div style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
                    Stock: {v.stockCount}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', minHeight: '48px' }}>
                    <input
                      type="checkbox" checked={v.isActive}
                      onChange={e => updateVariation(i, 'isActive', e.target.checked)}
                    />
                    Active
                  </label>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--color-border)' }}>Variation</th>
                  <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--color-border)' }}>Price</th>
                  <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid var(--color-border)' }}>Stock</th>
                  <th style={{ textAlign: 'center', padding: '8px', borderBottom: '1px solid var(--color-border)' }}>Active</th>
                </tr>
              </thead>
              <tbody>
                {variations.map((v, i) => (
                  <tr key={v.id ?? i} style={{ opacity: v.isActive ? 1 : 0.5 }}>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--color-border)' }}>
                      {v.optionLabels.join(' / ') || 'Default'}
                    </td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--color-border)' }}>
                      <input
                        style={{ ...inputStyle, width: '100px', minHeight: '48px' }}
                        type="number" step="0.01" min="0.01"
                        value={v.price}
                        onChange={e => updateVariation(i, 'price', parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                      {v.stockCount}
                    </td>
                    <td style={{ padding: '8px', borderBottom: '1px solid var(--color-border)', textAlign: 'center' }}>
                      <input
                        type="checkbox" checked={v.isActive}
                        onChange={e => updateVariation(i, 'isActive', e.target.checked)}
                        style={{ width: '20px', height: '20px' }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {error && <p style={{ color: 'var(--color-error)', fontSize: '14px', marginTop: '8px' }}>{error}</p>}

      {/* Save button */}
      {variations.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <button
            style={{ ...btnSmall, background: 'var(--color-primary)', color: 'var(--color-accent)', fontWeight: '500' }}
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? 'Saving variations...' : 'Save Variations'}
          </button>
        </div>
      )}

      {confirmRemoveOption && (
        <ConfirmDialog
          message={`Removing this option will delete associated variations and their price data. This cannot be undone after saving.`}
          confirmLabel="Remove Option"
          onConfirm={confirmRemove}
          onCancel={() => setConfirmRemoveOption(null)}
        />
      )}
    </div>
  )
}
