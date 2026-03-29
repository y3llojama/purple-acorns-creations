'use client'

import { useState, useCallback, useEffect } from 'react'
import Image from 'next/image'
import { watermarkSrc } from '@/lib/image-url'

interface ImageCarouselProps {
  images: string[]
  alt: string
  watermark?: string | null
}

export default function ImageCarousel({ images, alt, watermark }: ImageCarouselProps) {
  const [current, setCurrent] = useState(0)
  const [zoomed, setZoomed] = useState(false)

  const toggleZoom = useCallback(() => {
    setZoomed((z) => !z)
  }, [])

  // Reset zoom when switching images
  const prev = useCallback(() => {
    setZoomed(false)
    setCurrent((c) => (c === 0 ? images.length - 1 : c - 1))
  }, [images.length])

  const next = useCallback(() => {
    setZoomed(false)
    setCurrent((c) => (c === images.length - 1 ? 0 : c + 1))
  }, [images.length])

  // Close zoom on Escape key
  useEffect(() => {
    if (!zoomed) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomed(false)
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [zoomed])

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
          overflow: zoomed ? 'visible' : 'hidden',
          background: 'var(--color-surface)',
          zIndex: zoomed ? 10 : 'auto',
        }}
      >
        <Image
          src={watermark ? watermarkSrc(images[current], watermark) : images[current]}
          alt={`${alt} — image ${current + 1} of ${images.length}`}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          onClick={toggleZoom}
          style={{
            objectFit: 'cover',
            cursor: zoomed ? 'zoom-out' : 'zoom-in',
            transform: zoomed ? 'scale(1.8)' : 'scale(1)',
            transition: 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            transformOrigin: 'center center',
            zIndex: zoomed ? 10 : 'auto',
            borderRadius: zoomed ? '8px' : '0',
          }}
        />

        {/* Prev / Next arrows — only when more than 1 image and not zoomed */}
        {images.length > 1 && !zoomed && (
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
              onClick={() => { setZoomed(false); setCurrent(i) }}
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
