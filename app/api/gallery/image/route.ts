import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'
import { isValidHttpsUrl } from '@/lib/validate'
import { getSettings } from '@/lib/theme'
import { interpolate, buildVars } from '@/lib/variables'

// Rate limiter: 30 requests per IP per 60 seconds
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()
const RATE_WINDOW = 60_000
const RATE_LIMIT = 30
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

  // Fetch the original image
  const imageRes = await fetch(url)
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

  // Get image dimensions for scaling watermark
  const metadata = await sharp(buffer).metadata()
  const width = metadata.width || 800
  const height = metadata.height || 800

  // Load embedded font so librsvg can render script text reliably
  const fontPath = path.join(process.cwd(), 'public', 'fonts', 'DancingScript-Regular.ttf')
  const fontB64 = fs.readFileSync(fontPath).toString('base64')

  // Create diagonal watermark SVG overlay tiled across the image
  const fontSize = Math.max(18, Math.round(width / 18))
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>
          @font-face {
            font-family: 'DancingScript';
            src: url('data:font/truetype;base64,${fontB64}') format('truetype');
          }
        </style>
        <pattern id="wm" x="0" y="0" width="${fontSize * watermark.length * 0.65}" height="${fontSize * 4}" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
          <text x="0" y="${fontSize}" font-family="DancingScript, sans-serif" font-size="${fontSize}" fill="white" opacity="0.3">${escapeXml(watermark)}</text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#wm)" />
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
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
