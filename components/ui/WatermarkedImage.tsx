import Image, { type ImageProps } from 'next/image'
import type { CSSProperties } from 'react'

/**
 * Wraps a Next.js <Image> (fill mode) with a semi-transparent diagonal
 * "PREVIEW" watermark overlay.  Drop-in replacement for the common pattern:
 *
 *   <div style={{ position: 'relative', ... }}>
 *     <Image fill ... />
 *   </div>
 *
 * The wrapper div becomes the relative container; the watermark is rendered
 * as a sibling div on top of the image.
 */

interface WatermarkedImageProps {
  /** Style applied to the outer wrapper div (must include sizing, e.g. aspectRatio or explicit width/height). */
  containerStyle?: CSSProperties
  /** Additional className on the container if needed. */
  containerClassName?: string
  /** All Next.js Image props except `fill` (always true). */
  imageProps: Omit<ImageProps, 'fill'>
  /** Watermark label text. Defaults to "PREVIEW". */
  label?: string
}

const watermarkOverlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
  pointerEvents: 'none',
  zIndex: 1,
}

const watermarkTextStyle: CSSProperties = {
  fontSize: 'clamp(18px, 4vw, 32px)',
  fontFamily: 'var(--font-display)',
  fontWeight: 600,
  color: 'var(--color-primary)',
  opacity: 0.18,
  transform: 'rotate(-30deg)',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  letterSpacing: '4px',
  textTransform: 'uppercase',
}

export default function WatermarkedImage({
  containerStyle,
  containerClassName,
  imageProps,
  label = 'PREVIEW',
}: WatermarkedImageProps) {
  return (
    <div
      className={containerClassName}
      style={{ position: 'relative', overflow: 'hidden', ...containerStyle }}
    >
      <Image fill {...imageProps} />
      <div style={watermarkOverlayStyle} aria-hidden="true">
        <span style={watermarkTextStyle}>{label}</span>
      </div>
    </div>
  )
}
