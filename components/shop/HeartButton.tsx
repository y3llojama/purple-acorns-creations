'use client'
import { useState, useEffect } from 'react'
import { Heart } from 'lucide-react'

interface Props { productId: string; productName: string }

const STORAGE_KEY = 'pac_saved'
function getSaved(): string[] { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') } catch { return [] } }
function setSaved(ids: string[]): void { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)) } catch {} }

export default function HeartButton({ productId, productName }: Props) {
  const [saved, setSavedState] = useState(false)

  useEffect(() => { setSavedState(getSaved().includes(productId)) }, [productId])

  function toggle(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation()
    const current = getSaved()
    const next = current.includes(productId) ? current.filter(id => id !== productId) : [...current, productId]
    setSaved(next); setSavedState(next.includes(productId))
    window.dispatchEvent(new Event('pac_saved_changed'))
  }

  return (
    <button
      onClick={toggle}
      aria-label={saved ? `Remove ${productName} from saved items` : `Save ${productName}`}
      aria-pressed={saved}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', minHeight: '48px', minWidth: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: saved ? 'var(--color-error)' : 'var(--color-text-muted)' }}
    >
      <Heart size={20} fill={saved ? 'var(--color-error)' : 'none'} stroke={saved ? 'var(--color-error)' : 'currentColor'} />
    </button>
  )
}
