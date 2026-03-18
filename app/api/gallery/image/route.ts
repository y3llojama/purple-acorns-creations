import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import { isValidHttpsUrl } from '@/lib/validate'
import { getSettings } from '@/lib/theme'

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')
  if (!url || !isValidHttpsUrl(url)) {
    return NextResponse.json({ error: 'Valid image URL required' }, { status: 400 })
  }

  const settings = await getSettings()
  const watermark = settings.gallery_watermark

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
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    })
  }

  // Get image dimensions for scaling watermark
  const metadata = await sharp(buffer).metadata()
  const width = metadata.width || 800
  const height = metadata.height || 800

  // Create diagonal watermark SVG overlay tiled across the image
  const fontSize = Math.max(16, Math.round(width / 20))
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="wm" x="0" y="0" width="${fontSize * watermark.length * 0.7}" height="${fontSize * 4}" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
          <text x="0" y="${fontSize}" font-family="sans-serif" font-size="${fontSize}" fill="white" opacity="0.25">${escapeXml(watermark)}</text>
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
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
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
