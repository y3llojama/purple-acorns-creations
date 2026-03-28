/**
 * DJB2 hash — returns first 8 hex chars.
 * Used as a cache key component, not a security control.
 */
export function djb2Hash(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * Build a watermark proxy URL with cache-busting params.
 *
 * @param imageUrl  - the original image URL (e.g. Supabase Storage public URL)
 * @param watermark - the watermark text (used to derive &wm= cache key)
 * @param version   - optional timestamp for &v= cache-busting (e.g. product.updated_at)
 */
export function watermarkSrc(imageUrl: string, watermark: string, version?: string): string {
  const params = new URLSearchParams({ url: imageUrl, wm: djb2Hash(watermark) })
  if (version) params.set('v', version)
  return `/api/gallery/image?${params.toString()}`
}
