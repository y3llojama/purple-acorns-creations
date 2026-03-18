'use client'
import { useRef, useState, useEffect } from 'react'
import Image from 'next/image'
import type { FollowAlongPhoto } from '@/lib/supabase/types'

interface Props {
  photos: FollowAlongPhoto[]
  handle: string
}

export default function FollowAlongStrip({ photos, handle }: Props) {
  const stripRef = useRef<HTMLDivElement>(null)
  const [paused, setPaused] = useState(false)
  const shouldScroll = photos.length >= 5

  // For seamless loop: duplicate the photos
  const displayPhotos = shouldScroll ? [...photos, ...photos] : photos

  // Scroll animation via CSS keyframes injected once
  const animationName = 'followAlongScroll'
  const photoWidth = 140
  const gap = 16
  const ctaWidth = 200
  const totalWidth = photos.length * (photoWidth + gap) + ctaWidth + gap

  useEffect(() => {
    if (!shouldScroll) return
    // Inject keyframe if not already present
    const styleId = 'follow-along-keyframes'
    if (document.getElementById(styleId)) return
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `@keyframes ${animationName} { 0% { transform: translateX(0); } 100% { transform: translateX(-${totalWidth}px); } }`
    document.head.appendChild(style)
    return () => { style.remove() }
  }, [shouldScroll, totalWidth])

  // Calculate CTA insert position (middle of the photos array)
  const ctaIndex = Math.floor(photos.length / 2)

  function renderPhotos(list: FollowAlongPhoto[], offset: number) {
    const elements: React.ReactNode[] = []
    list.forEach((photo, i) => {
      if (i === ctaIndex && offset === 0) {
        // Insert spacer for the CTA overlay
        elements.push(
          <div key={`cta-spacer-${offset}`} style={{ width: `${ctaWidth}px`, flexShrink: 0 }} />
        )
      }
      elements.push(
        <Image
          key={`${photo.id}-${offset}-${i}`}
          src={photo.storage_path}
          alt=""
          role="presentation"
          width={photoWidth}
          height={photoWidth}
          style={{
            width: `${photoWidth}px`,
            height: `${photoWidth}px`,
            objectFit: 'cover',
            borderRadius: '10px',
            flexShrink: 0,
          }}
        />
      )
    })
    return elements
  }

  const stripStyle: React.CSSProperties = {
    display: 'flex',
    gap: `${gap}px`,
    alignItems: 'center',
    ...(shouldScroll
      ? {
          width: 'max-content',
          animation: `${animationName} ${photos.length * 3}s linear infinite`,
          animationPlayState: paused ? 'paused' : 'running',
        }
      : {
          justifyContent: 'center',
        }),
  }

  return (
    <div
      style={{ position: 'relative', overflow: 'hidden', padding: '16px 0' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div ref={stripRef} style={stripStyle}>
        {shouldScroll ? (
          <>
            {renderPhotos(photos, 0)}
            {renderPhotos(photos, 1)}
          </>
        ) : (
          <>
            {photos.slice(0, ctaIndex).map((photo, i) => (
              <Image
                key={photo.id}
                src={photo.storage_path}
                alt=""
                role="presentation"
                width={photoWidth}
                height={photoWidth}
                style={{ width: `${photoWidth}px`, height: `${photoWidth}px`, objectFit: 'cover', borderRadius: '10px', flexShrink: 0 }}
              />
            ))}
            <div style={{ width: `${ctaWidth}px`, flexShrink: 0 }} />
            {photos.slice(ctaIndex).map((photo, i) => (
              <Image
                key={photo.id}
                src={photo.storage_path}
                alt=""
                role="presentation"
                width={photoWidth}
                height={photoWidth}
                style={{ width: `${photoWidth}px`, height: `${photoWidth}px`, objectFit: 'cover', borderRadius: '10px', flexShrink: 0 }}
              />
            ))}
          </>
        )}
      </div>

      {/* Fixed center CTA overlay */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'var(--color-bg)',
        padding: '20px 32px',
        borderRadius: '16px',
        textAlign: 'center',
        boxShadow: '0 2px 24px rgba(0,0,0,0.08)',
        zIndex: 2,
      }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 600, color: 'var(--color-primary)', marginBottom: '6px' }}>
          Follow Along
        </div>
        <div style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
          Our latest creations
        </div>
        <a
          href={`https://instagram.com/${handle}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block',
            padding: '8px 20px',
            border: '1.5px solid var(--color-text)',
            borderRadius: '24px',
            fontSize: '14px',
            color: 'var(--color-text)',
            textDecoration: 'none',
            minHeight: '48px',
            lineHeight: '30px',
          }}
        >
          @{handle}
        </a>
      </div>
    </div>
  )
}
