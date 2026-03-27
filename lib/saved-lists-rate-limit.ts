import { getClientIp } from '@/lib/get-client-ip'

interface RateEntry {
  count: number
  reset: number
}

interface RateBucket {
  map: Map<string, RateEntry>
  lastPrune: number
}

const buckets: Record<string, RateBucket> = {}

function getBucket(name: string): RateBucket {
  if (!buckets[name]) {
    buckets[name] = { map: new Map(), lastPrune: Date.now() }
  }
  return buckets[name]
}

function prune(bucket: RateBucket, windowMs: number): void {
  const now = Date.now()
  if (now - bucket.lastPrune < 5 * 60_000) return
  bucket.lastPrune = now
  for (const [ip, entry] of bucket.map) {
    if (now > entry.reset) bucket.map.delete(ip)
  }
}

/**
 * Check rate limit for a given bucket name.
 * Returns true if the request is allowed, false if rate-limited.
 */
export function checkRate(
  request: Request,
  bucketName: string,
  maxRequests: number,
  windowMs: number
): boolean {
  const ip = getClientIp(request)
  const bucket = getBucket(bucketName)
  prune(bucket, windowMs)

  const now = Date.now()
  const entry = bucket.map.get(ip) ?? { count: 0, reset: now + windowMs }

  if (now > entry.reset) {
    entry.count = 0
    entry.reset = now + windowMs
  }

  entry.count++
  bucket.map.set(ip, entry)
  return entry.count <= maxRequests
}

/** Rate-limit response helper */
export function rateLimitResponse() {
  return Response.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429 }
  )
}
