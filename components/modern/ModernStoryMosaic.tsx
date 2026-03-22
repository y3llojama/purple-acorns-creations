'use client'

import { useRef, useEffect } from 'react'

interface GalleryImage {
  url: string
  alt_text: string | null
  square_url?: string | null
}

export default function ModernStoryMosaic({ photos, watermark }: { photos: GalleryImage[]; watermark?: string | null }) {
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  // Staggered fade-up as items scroll into view
  useEffect(() => {
    const items = itemRefs.current.filter(Boolean) as HTMLDivElement[]
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            ;(entry.target as HTMLDivElement).classList.add('mss-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12 }
    )
    items.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <style>{`
        .mss-scroll-track {
          display: flex;
          gap: 12px;
          height: 100%;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .mss-scroll-track::-webkit-scrollbar { display: none; }

        .mss-item {
          flex: 0 0 clamp(160px, 28%, 220px);
          position: relative;
          overflow: hidden;
          border-radius: 6px;
          background: color-mix(in srgb, var(--color-primary) 4%, white 96%);
          scroll-snap-align: start;
          opacity: 0;
          transform: translateY(20px);
          transition:
            opacity 0.6s ease,
            transform 0.6s cubic-bezier(0.46, 0.01, 0.32, 1),
            box-shadow 0.3s ease;
          will-change: transform, opacity;
        }

        .mss-item.mss-visible {
          opacity: 1;
          transform: translateY(0);
        }

        .mss-item img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          box-sizing: border-box;
          transition: transform 0.4s ease;
        }

        .mss-item:hover img { transform: scale(1.04); }
        .mss-item:hover { box-shadow: 0 8px 24px rgba(0,0,0,0.12); }

        @media (prefers-reduced-motion: reduce) {
          .mss-item {
            opacity: 1 !important;
            transform: none !important;
            transition: none !important;
          }
        }
      `}</style>

      <div className="mss-scroll-track">
        {photos.map((img, i) => {
          const href = img.square_url || '/shop'
          const external = !!img.square_url
          const imgSrc = watermark && img.url.startsWith('https')
            ? `/api/gallery/image?url=${encodeURIComponent(img.url)}`
            : img.url
          return (
            <div
              key={i}
              ref={el => { itemRefs.current[i] = el }}
              className="mss-item"
            >
              <a
                href={href}
                {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                style={{ display: 'block', width: '100%', height: '100%' }}
                aria-label={img.alt_text ?? 'View product'}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgSrc} alt={img.alt_text ?? ''} />
              </a>
            </div>
          )
        })}
      </div>
    </>
  )
}
