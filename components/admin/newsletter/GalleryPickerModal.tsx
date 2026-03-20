'use client'
import { useEffect, useRef } from 'react'
import { isValidHttpsUrl } from '@/lib/validate'

interface GalleryItem {
  id: string
  url: string
  alt_text: string
}

interface Props {
  items: GalleryItem[]
  onPick: (url: string) => void
  onClose: () => void
}

export default function GalleryPickerModal({ items, onPick, onClose }: Props) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    closeButtonRef.current?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }

      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        const focusableArray = Array.from(focusable)
        if (focusableArray.length === 0) return

        const first = focusableArray[0]
        const last = focusableArray[focusableArray.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function handlePick(url: string) {
    onPick(url)
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pick image from gallery"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={panelRef}
        style={{
          background: 'var(--color-bg)',
          borderRadius: '8px',
          width: '100%',
          maxWidth: '600px',
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-border)',
          flexShrink: 0,
        }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text)' }}>
            Pick from Gallery
          </h2>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="Close gallery picker"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '20px',
              color: 'var(--color-text-muted)',
              minHeight: '48px',
              minWidth: '48px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '4px',
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          {items.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '32px 0' }}>
              No gallery images available
            </p>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '8px',
            }}>
              {items.map((item) => {
                const valid = isValidHttpsUrl(item.url)
                return (
                  <button
                    key={item.id}
                    onClick={() => valid ? handlePick(item.url) : undefined}
                    disabled={!valid}
                    title={item.alt_text || item.url}
                    style={{
                      padding: 0,
                      border: '2px solid var(--color-border)',
                      borderRadius: '4px',
                      overflow: 'hidden',
                      cursor: valid ? 'pointer' : 'not-allowed',
                      height: '160px',
                      background: 'var(--color-surface)',
                      opacity: valid ? 1 : 0.4,
                    }}
                  >
                    {valid ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.url}
                        alt={item.alt_text || ''}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          display: 'block',
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', padding: '8px', display: 'block' }}>
                        Invalid URL
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
