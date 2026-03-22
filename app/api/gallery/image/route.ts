import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { Resvg } from '@resvg/resvg-js'
import path from 'node:path'
import { isValidHttpsUrl } from '@/lib/validate'
import { getSettings } from '@/lib/theme'
import { interpolate, buildVars } from '@/lib/variables'

// Inter Medium — clean sans-serif matching the site nav aesthetic, bundled via outputFileTracingIncludes.
const FONT_PATH = path.join(process.cwd(), 'public', 'fonts', 'Inter-Medium.ttf')

// Rate limiter: 200 requests per IP per 60 seconds
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()
const RATE_WINDOW = 60_000
const RATE_LIMIT = 200
const PRUNE_INTERVAL = 5 * 60_000
let lastPrune = Date.now()

function pruneRateLimitMap() {
  const now = Date.now()
  if (now - lastPrune < PRUNE_INTERVAL) return
  lastPrune = now
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_WINDOW) rateLimitMap.delete(ip)
  }
}

export async function GET(request: NextRequest) {
  pruneRateLimitMap()
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (entry && now - entry.windowStart < RATE_WINDOW) {
    if (entry.count >= RATE_LIMIT) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }
    entry.count++
  } else {
    rateLimitMap.set(ip, { count: 1, windowStart: now })
  }

  const url = request.nextUrl.searchParams.get('url')
  if (!url || !isValidHttpsUrl(url)) {
    return NextResponse.json({ error: 'Valid image URL required' }, { status: 400 })
  }

  const settings = await getSettings()
  const watermark = settings.gallery_watermark
    ? interpolate(settings.gallery_watermark, buildVars(settings.business_name))
    : null

  // Fetch the original image — no-store so Next.js data cache doesn't serve stale bytes
  const imageRes = await fetch(url, { cache: 'no-store' })
  if (!imageRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 })
  }

  const buffer = Buffer.from(await imageRes.arrayBuffer())

  if (!watermark) {
    // No watermark — pass through with cache headers
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': imageRes.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  }

  try {
    // Read stored metadata. sharp().metadata() always returns stored (pre-rotation) dimensions.
    // Phone cameras store landscape shots as portrait with EXIF orientation 6 (90° CW) or 8 (90° CCW).
    // Without accounting for this, all coordinate math runs in the wrong space and the watermark
    // ends up in a random corner after the browser applies EXIF rotation.
    const metadata = await sharp(buffer).metadata()
    const orientation = metadata.orientation ?? 1

    // Orientations 5–8 mean the image is rotated 90° or 270° — visual width/height are swapped.
    const rotated90 = orientation >= 5
    const width  = rotated90 ? (metadata.height ?? 800) : (metadata.width  ?? 800)
    const height = rotated90 ? (metadata.width  ?? 800) : (metadata.height ?? 800)

    // All position math is now in VISUAL (post-rotation) coordinate space.
    // Images are displayed in square (1:1) cards with objectFit:cover.
    // For portrait images (height > width), cover crops equally from top and bottom —
    // the visible region is the center `width × width` slice.
    // For landscape images (width > height), cover crops equally from left and right —
    // the visible region is the center `height × height` slice.
    const squareSide = Math.min(width, height)
    const safeBottom = Math.round((height + squareSide) / 2) // bottom edge of 1:1 safe square
    const pad = Math.round(squareSide * 0.015)               // ~1.5% inset from safe edges

    // Generalised safe-right for multiple container aspect ratios.
    // The story mosaic uses a tall rectangle (~220×460px, AR≈0.478), while product cards are 1:1.
    const MOSAIC_AR = 220 / 460
    const safeRight = Math.round((width + Math.min(squareSide, MOSAIC_AR * height)) / 2)
    const wmX = safeRight - pad
    const wmY = safeBottom - pad

    // Font size: squareSide/20 gives ~11px apparent at 220px mosaic width and ~15px in shop cards.
    // Stroke width scaled proportionally so it looks consistent across image sizes.
    const fontSize = Math.max(14, Math.round(squareSide / 20))
    const strokeWidth = Math.max(2, Math.round(squareSide / 120))
    const letterSpacing = Math.round(fontSize * 0.08)

    // SVG overlay is in visual dimensions (post-rotation).
    // We use resvg-js (Rust SVG renderer) instead of Sharp's SVG composite (which uses librsvg).
    // librsvg requires fontconfig to initialize Pango — fontconfig is unavailable on Vercel Lambda.
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <text
    x="${wmX}"
    y="${wmY}"
    text-anchor="end"
    font-family="Inter, sans-serif"
    font-size="${fontSize}"
    font-weight="500"
    letter-spacing="${letterSpacing}"
    fill="white"
    fill-opacity="0.92"
    stroke="black"
    stroke-opacity="0.6"
    stroke-width="${strokeWidth}"
    paint-order="stroke fill"
  >${escapeXml(watermark)}</text>
</svg>`

    const resvg = new Resvg(svg, {
      font: {
        fontFiles: [FONT_PATH],
        loadSystemFonts: false,
        defaultFontFamily: 'Inter',
      },
    })
    const overlayPng = resvg.render().asPng()

    // .rotate() with no argument applies EXIF orientation and strips the tag,
    // so the composited overlay (in visual coordinates) lands in the right place.
    const watermarked = await sharp(buffer)
      .rotate()
      .composite([{ input: overlayPng, top: 0, left: 0 }])
      .jpeg({ quality: 85 })
      .toBuffer()

    return new NextResponse(new Uint8Array(watermarked), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch (err) {
    console.error('[watermark] processing failed, passing through original:', err)
    // Fall back to original image rather than returning a broken 500
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': imageRes.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=60',
      },
    })
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
