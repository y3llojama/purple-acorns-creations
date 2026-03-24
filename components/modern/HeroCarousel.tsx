'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import type { HeroSlide } from '@/lib/supabase/types'

interface Props {
  slides: HeroSlide[]
  transition: 'crossfade' | 'slide'
  intervalMs: number
}

export default function HeroCarousel({ slides, transition, intervalMs }: Props) {
  const [current, setCurrent] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)
  const pausedRef = useRef(false)

  const total = slides.length
  const multi = total > 1

  const goTo = useCallback((n: number) => setCurrent(((n % total) + total) % total), [total])
  const next = useCallback(() => goTo(current + 1), [goTo, current])
  const prev = useCallback(() => goTo(current - 1), [goTo, current])

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mql.matches)
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    if (!multi || reducedMotion) return
    const id = setInterval(() => {
      if (!pausedRef.current) setCurrent(c => (c + 1) % total)
    }, intervalMs)
    return () => clearInterval(id)
  }, [multi, reducedMotion, intervalMs, total])

  if (total === 0) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, var(--color-accent) 0%, #e8d5a0 50%, var(--color-secondary, var(--color-accent)) 100%)',
        minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <p style={{ fontStyle: 'italic', color: 'var(--color-primary)', opacity: 0.4, fontSize: '24px', margin: 0 }}>
          Handmade with love
        </p>
      </div>
    )
  }

  const transitionStyle = reducedMotion ? {} : { transition: transition === 'crossfade' ? 'opacity 0.6s ease' : 'transform 0.4s ease' }

  return (
    <div
      style={{ position: 'relative', width: '100%', minHeight: '400px', overflow: 'hidden' }}
      onMouseEnter={() => { pausedRef.current = true }}
      onMouseLeave={() => { pausedRef.current = false }}
    >
      {/* Live region for screen readers */}
      <div aria-live="polite" aria-atomic="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>
        {slides[current]?.alt_text}
      </div>

      {/* Slides */}
      {slides.map((slide, i) => {
        const isActive = i === current
        const style: React.CSSProperties = transition === 'crossfade'
          ? { position: i === 0 ? 'relative' : 'absolute', inset: 0, opacity: isActive ? 1 : 0, ...transitionStyle }
          : { position: i === 0 ? 'relative' : 'absolute', inset: 0, transform: `translateX(${(i - current) * 100}%)`, ...transitionStyle }
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={slide.id}
            src={slide.url}
            alt={slide.alt_text}
            style={{ ...style, width: '100%', height: '100%', minHeight: '400px', objectFit: 'cover', display: 'block' }}
          />
        )
      })}

      {/* Controls — only when multiple slides */}
      {multi && (
        <>
          <button
            aria-label="Previous slide"
            onClick={prev}
            style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.82)', border: 'none', borderRadius: '50%',
              width: 48, height: 48, fontSize: 20, cursor: 'pointer', zIndex: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)', minHeight: 48,
            }}
          >‹</button>
          <button
            aria-label="Next slide"
            onClick={next}
            style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(255,255,255,0.82)', border: 'none', borderRadius: '50%',
              width: 48, height: 48, fontSize: 20, cursor: 'pointer', zIndex: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)', minHeight: 48,
            }}
          >›</button>
          <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, zIndex: 2 }}>
            {slides.map((_, i) => (
              <button
                key={i}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === current ? 'true' : undefined}
                onClick={() => goTo(i)}
                style={{
                  width: 48, height: 48, border: 'none', padding: 0, cursor: 'pointer',
                  background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <span style={{
                  width: 9, height: 9, borderRadius: '50%', display: 'block',
                  background: i === current ? 'var(--carousel-dot-active)' : 'var(--carousel-dot-inactive)',
                  transform: i === current ? 'scale(1.2)' : 'scale(1)',
                  transition: 'background 0.2s, transform 0.2s',
                }} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
