'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PrivateSale } from '@/lib/supabase/types'

function getStatus(sale: PrivateSale): 'active' | 'expired' | 'used' | 'revoked' {
  if (sale.used_at) return 'used'
  if (sale.revoked_at) return 'revoked'
  if (new Date(sale.expires_at) <= new Date()) return 'expired'
  return 'active'
}

const STATUS_STYLES: Record<string, { background: string; color: string }> = {
  active:  { background: '#16a34a', color: '#fff' },
  expired: { background: '#6b7280', color: '#fff' },
  used:    { background: '#2563eb', color: '#fff' },
  revoked: { background: '#dc2626', color: '#fff' },
}

interface Props {
  initialData: { data: PrivateSale[]; total: number }
}

export default function PrivateSaleList({ initialData }: Props) {
  const router = useRouter()
  const [sales, setSales] = useState<PrivateSale[]>(initialData.data)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleRevoke(id: string) {
    setRevoking(id)
    setError(null)
    const res = await fetch(`/api/admin/private-sales/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Failed to revoke sale')
      setRevoking(null)
      return
    }
    setSales(prev => prev.map(s => s.id === id ? { ...s, revoked_at: new Date().toISOString() } : s))
    setRevoking(null)
    router.refresh()
  }

  function handleCopyLink(token: string) {
    navigator.clipboard.writeText(`${process.env.NEXT_PUBLIC_SITE_URL}/private-sale/${token}`)
  }

  if (sales.length === 0) {
    return (
      <p style={{ color: 'var(--color-text-muted, #6b7280)', fontStyle: 'italic' }}>
        No private sales yet. Create one using the button above.
      </p>
    )
  }

  return (
    <div>
      {error && (
        <p role="alert" style={{ color: '#dc2626', marginBottom: '16px' }}>{error}</p>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border, #e5e7eb)', textAlign: 'left' }}>
              <th style={{ padding: '12px 16px', fontWeight: '600', color: 'var(--color-primary)' }}>Customer Note</th>
              <th style={{ padding: '12px 16px', fontWeight: '600', color: 'var(--color-primary)' }}>Items</th>
              <th style={{ padding: '12px 16px', fontWeight: '600', color: 'var(--color-primary)' }}>Total Value</th>
              <th style={{ padding: '12px 16px', fontWeight: '600', color: 'var(--color-primary)' }}>Expires</th>
              <th style={{ padding: '12px 16px', fontWeight: '600', color: 'var(--color-primary)' }}>Status</th>
              <th style={{ padding: '12px 16px', fontWeight: '600', color: 'var(--color-primary)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sales.map(sale => {
              const status = getStatus(sale)
              const items = sale.items ?? []
              const totalValue = items.reduce((sum, item) => sum + item.custom_price * item.quantity, 0)
              const firstItemName = items[0]?.product?.name ?? 'Item'
              const itemsSummary = items.length > 1
                ? `${firstItemName} + ${items.length - 1} more`
                : firstItemName
              const statusStyle = STATUS_STYLES[status]

              return (
                <tr key={sale.id} style={{ borderBottom: '1px solid var(--color-border, #e5e7eb)' }}>
                  <td style={{ padding: '12px 16px', color: 'var(--color-text, #111827)' }}>
                    {sale.customer_note ?? <em style={{ color: '#9ca3af' }}>None</em>}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-text, #111827)' }}>
                    {items.length === 0 ? <em style={{ color: '#9ca3af' }}>No items</em> : itemsSummary}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-text, #111827)' }}>
                    ${totalValue.toFixed(2)}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--color-text, #111827)' }}>
                    {new Date(sale.expires_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      ...statusStyle,
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '600',
                      textTransform: 'capitalize',
                      display: 'inline-block',
                    }}>
                      {status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {status === 'active' && (
                        <>
                          <button
                            onClick={() => handleCopyLink(sale.token)}
                            style={{
                              padding: '0 16px',
                              minHeight: '48px',
                              background: 'var(--color-primary)',
                              color: 'var(--color-accent)',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '13px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Copy Link
                          </button>
                          <button
                            onClick={() => handleRevoke(sale.id)}
                            disabled={revoking === sale.id}
                            style={{
                              padding: '0 16px',
                              minHeight: '48px',
                              background: '#dc2626',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: revoking === sale.id ? 'not-allowed' : 'pointer',
                              fontSize: '13px',
                              opacity: revoking === sale.id ? 0.6 : 1,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {revoking === sale.id ? 'Revoking…' : 'Revoke'}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: '12px', color: '#6b7280', fontSize: '13px' }}>
        Showing {sales.length} of {initialData.total} sales
      </p>
    </div>
  )
}
