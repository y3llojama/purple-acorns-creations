'use client'
import { useEffect, useRef } from 'react'
import HeroCarousel from '@/components/modern/HeroCarousel'
import type { HeroSlide } from '@/lib/supabase/types'

interface Props {
  slides: HeroSlide[]
  transition: 'crossfade' | 'slide'
  intervalMs: number
  onClose: () => void
  triggerRef: React.RefObject<HTMLButtonElement>
}

export default function HeroCarouselPreviewModal({ slides, transition, intervalMs, onClose, triggerRef }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const closeBtn = dialogRef.current?.querySelector<HTMLButtonElement>('button')
    closeBtn?.focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ) ?? [])
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      triggerRef.current?.focus()
    }
  }, [onClose, triggerRef])

  return (
    <div
      role="presentation"
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Hero carousel preview"
        style={{ background: 'var(--color-surface, #fff)', borderRadius: '8px', overflow: 'hidden', width: '680px', maxWidth: '95vw', boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}
      >
        <div style={{ background: 'var(--color-primary)', color: 'var(--color-accent)', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.05em' }}>Hero Carousel Preview</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--color-accent)', fontSize: '20px', cursor: 'pointer', lineHeight: 1, padding: 0, minHeight: 'unset' }}
            aria-label="Close preview"
          >×</button>
        </div>
        <HeroCarousel slides={slides} transition={transition} intervalMs={intervalMs} />
      </div>
    </div>
  )
}
