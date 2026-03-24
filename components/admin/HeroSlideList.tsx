'use client'
import React, { useState, useEffect, useRef } from 'react'
import ImageUploader from './ImageUploader'
import HeroCarouselPreviewModal from './HeroCarouselPreviewModal'
import type { HeroSlide } from '@/lib/supabase/types'

interface Props {
  initialSlides: HeroSlide[]
  transition: 'crossfade' | 'slide'
  intervalMs: number
}

export default function HeroSlideList({ initialSlides, transition, intervalMs }: Props) {
  const [slides, setSlides] = useState<HeroSlide[]>(initialSlides)
  const [showUploader, setShowUploader] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previewBtnRef = useRef<HTMLButtonElement>(null)

  // Fetch slides from the API on mount (initialSlides is [] when called from BrandingEditor)
  useEffect(() => {
    if (initialSlides.length > 0) return
    fetch('/api/admin/hero-slides')
      .then(r => r.json())
      .then((data: HeroSlide[]) => setSlides(data))
      .catch(() => setError('Failed to load slides.'))
  }, [initialSlides.length])

  async function handleUpload(url: string, altText: string) {
    const res = await fetch('/api/admin/hero-slides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, alt_text: altText, sort_order: slides.length }),
    })
    if (!res.ok) { setError('Failed to add slide.'); return }
    const newSlide: HeroSlide = await res.json()
    setSlides(prev => [...prev, newSlide])
    setShowUploader(false)
    setError(null)
  }

  async function handleRemove(id: string) {
    const res = await fetch(`/api/admin/hero-slides/${id}`, { method: 'DELETE' })
    if (!res.ok) { setError('Failed to remove slide.'); return }
    setSlides(prev => prev.filter(s => s.id !== id))
    setError(null)
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const newSlides = [...slides]
    const target = index + direction
    if (target < 0 || target >= newSlides.length) return
    ;[newSlides[index], newSlides[target]] = [newSlides[target], newSlides[index]]
    setSlides(newSlides)
    const res = await fetch('/api/admin/hero-slides/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: newSlides.map(s => s.id) }),
    })
    if (!res.ok) { setError('Failed to save order.'); setSlides(slides) }
  }

  return (
    <div>
      <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '14px' }}>
        Images cycle automatically on the homepage hero. First image loads first.
      </p>

      {/* Gallery grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '14px' }}>
        {slides.map((slide, i) => (
          <div key={slide.id} style={{ border: '2px solid var(--color-border)', borderRadius: '6px', overflow: 'hidden', position: 'relative', background: 'var(--color-surface)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={slide.url} alt={slide.alt_text} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
            {/* Position badge */}
            <span style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,0.55)', color: 'var(--color-on-primary)', fontSize: '11px', padding: '2px 7px', borderRadius: '10px' }}>
              {i + 1}
            </span>
            {/* Remove button */}
            <button
              onClick={() => handleRemove(slide.id)}
              title="Remove slide"
              style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(192,57,43,0.85)', color: 'var(--color-on-primary)', border: 'none', borderRadius: '50%', width: 24, height: 24, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'unset' }}
              aria-label={`Remove slide ${i + 1}`}
            >×</button>
            {/* Up/Down reorder */}
            <div style={{ position: 'absolute', bottom: 30, right: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {i > 0 && (
                <button onClick={() => handleMove(i, -1)} title="Move up" style={{ background: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: '3px', width: 22, height: 22, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'unset' }} aria-label={`Move slide ${i + 1} earlier`}>↑</button>
              )}
              {i < slides.length - 1 && (
                <button onClick={() => handleMove(i, 1)} title="Move down" style={{ background: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: '3px', width: 22, height: 22, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'unset' }} aria-label={`Move slide ${i + 1} later`}>↓</button>
              )}
            </div>
            {/* Alt text */}
            <div style={{ padding: '5px 8px', fontSize: '11px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}>
              {slide.alt_text}
            </div>
          </div>
        ))}

        {/* Add card */}
        {!showUploader && (
          <button
            onClick={() => setShowUploader(true)}
            style={{ border: '2px dashed var(--color-border)', borderRadius: '6px', aspectRatio: '4/3', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: '13px', background: 'var(--color-surface)', minHeight: 'unset' }}
          >
            <span style={{ fontSize: '28px', lineHeight: 1 }}>+</span>
            <span>Add Image</span>
          </button>
        )}
      </div>

      {showUploader && (
        <div style={{ marginBottom: '16px', padding: '16px', border: '1px solid var(--color-border)', borderRadius: '6px' }}>
          <ImageUploader bucket="branding" onUpload={handleUpload} label="Upload Slide Image" />
          <button onClick={() => setShowUploader(false)} style={{ marginTop: '8px', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '13px' }}>Cancel</button>
        </div>
      )}

      {error && <p role="alert" style={{ color: '#c05050', fontSize: '13px', marginBottom: '8px' }}>{error}</p>}

      {slides.length > 0 && (
        <button
          ref={previewBtnRef}
          onClick={() => setShowPreview(true)}
          style={{ background: 'var(--color-surface)', color: 'var(--color-primary)', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '9px 18px', fontSize: '13px', cursor: 'pointer', marginBottom: '4px' }}
        >
          ▶ Preview Carousel
        </button>
      )}

      {showPreview && (
        <HeroCarouselPreviewModal
          slides={slides}
          transition={transition}
          intervalMs={intervalMs}
          onClose={() => setShowPreview(false)}
          triggerRef={previewBtnRef as React.RefObject<HTMLButtonElement>}
        />
      )}
    </div>
  )
}
