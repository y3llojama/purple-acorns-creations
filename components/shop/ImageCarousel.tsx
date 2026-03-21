'use client'

import { useState, useCallback } from 'react'
import Image from 'next/image'

interface ImageCarouselProps {
  images: string[]
  alt: string
  watermark?: string | null
}

export default function ImageCarousel({ images, alt, watermark }: ImageCarouselProps) {
  const [current, setCurrent] = useState(0)

  const prev = useCallback(() => {
    setCurrent((c) => (c === 0 ? images.length - 1 : c - 1))
  }, [images.length])

  const next = useCallback(() => {
    setCurrent((c) => (c === images.length - 1 ? 0 : c + 1))
  }, [images.length])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    },
    [prev, next]
  )

  if (images.length === 0) {
    return (
      <div
        style={{
          position: 'relative',
          aspectRatio: '1',
          background: 'var(--color-surface)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-muted)',
        }}
      >
        No image
      </div>
    )
  }

  return (
    <div
      role="region"
      aria-label="Product images"
      onKeyDown={handleKeyDown}
      tabIndex={0}
      style={{ outline: 'none' }}
    >
      {/* Main image */}
      <div
        style={{
          position: 'relative',
          aspectRatio: '1',
          borderRadius: '8px',
          overflow: 'hidden',
          background: 'var(--color-surface)',
        }}
      >
        <Image
          src={images[current]}
          alt={`${alt} — image ${current + 1} of ${images.length}`}
          fill
          style={{ objectFit: 'cover' }}
          sizes="(max-width: 768px) 100vw, 500px"
          priority={current === 0}
        />

        {watermark && (
          <span aria-hidden="true" style={{ position: 'absolute', bottom: '8px', right: '10px', color: 'white', fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textShadow: '0 1px 4px rgba(0,0,0,0.85)', pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap', zIndex: 2 }}>
            {watermark}
          </span>
        )}

        {/* Prev / Next arrows — only when more than 1 image */}
        {images.length > 1 && (
          <>
            <button
              aria-label="Previous image"
              onClick={prev}
              style={{
                position: 'absolute',
                left: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '50%',
                cursor: 'pointer',
                minHeight: '48px',
                minWidth: '48px',
                fontSize: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-primary)',
                zIndex: 1,
              }}
            >
              ‹
            </button>
            <button
              aria-label="Next image"
              onClick={next}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '50%',
                cursor: 'pointer',
                minHeight: '48px',
                minWidth: '48px',
                fontSize: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-primary)',
                zIndex: 1,
              }}
            >
              ›
            </button>
          </>
        )}
      </div>

      {/* Dot indicators */}
      {images.length > 1 && (
        <div
          role="tablist"
          aria-label="Image navigation"
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '8px',
            marginTop: '12px',
          }}
        >
          {images.map((_, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === current}
              aria-label={`Go to image ${i + 1}`}
              onClick={() => setCurrent(i)}
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                minHeight: '48px',
                minWidth: '48px',
                background: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  display: 'block',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: i === current ? 'var(--color-primary)' : 'var(--color-border)',
                  transition: 'background 0.2s',
                }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
