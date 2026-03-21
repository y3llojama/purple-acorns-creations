import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { isValidHttpsUrl } from '@/lib/validate'
import { getSettings } from '@/lib/theme'
import { interpolate, buildVars } from '@/lib/variables'

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
    // Get image dimensions for scaling watermark
    const metadata = await sharp(buffer).metadata()
    const width = metadata.width || 800
    const height = metadata.height || 800

    // Images are displayed in square (1:1) cards with objectFit:cover.
    // For portrait images (height > width), cover crops equally from top and bottom —
    // the visible region is the center `width × width` slice.
    // For landscape images (width > height), cover crops equally from left and right —
    // the visible region is the center `height × height` slice.
    // We must place the watermark inside this "always-visible square" to guarantee visibility.
    const squareSide = Math.min(width, height)
    const safeRight = Math.round((width + squareSide) / 2)   // right edge of safe square
    const safeBottom = Math.round((height + squareSide) / 2) // bottom edge of safe square
    const pad = Math.round(squareSide * 0.015)               // ~1.5% inset from safe edges
    const wmX = safeRight - pad
    const wmY = safeBottom - pad

    // Font size relative to the visible square, not the full image dimension.
    // Single bottom-right watermark — white bold text with black stroke for legibility on any background.
    // paint-order="stroke fill" draws the stroke behind the fill, creating a visible outline even on white backgrounds.
    // stroke="black" stroke-opacity="0.85" (NOT stroke="rgba(...)") — librsvg ignores rgba() in presentation attributes.
    const fontSize = Math.max(14, Math.round(squareSide / 30))
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <text
          x="${wmX}"
          y="${wmY}"
          text-anchor="end"
          font-family="Arial, Helvetica, sans-serif"
          font-size="${fontSize}"
          font-weight="bold"
          fill="white"
          stroke="black"
          stroke-opacity="0.85"
          stroke-width="3"
          paint-order="stroke fill"
          letter-spacing="0.04em"
        >${escapeXml(watermark)}</text>
      </svg>
    `

    const watermarked = await sharp(buffer)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .jpeg({ quality: 85 })
      .toBuffer()

    return new NextResponse(new Uint8Array(watermarked), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch (err) {
    console.error('[watermark] Sharp processing failed, passing through original:', err)
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
