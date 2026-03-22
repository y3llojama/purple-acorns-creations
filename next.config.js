/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow Jest (via next/jest) to transform these ESM-only packages
  transpilePackages: ['marked'],
  async headers() {
    return [
      // Security headers for all routes
      // CORS is handled per-route via lib/cors.ts (not set globally here)
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://w.behold.so https://web.squarecdn.com https://sandbox.web.squarecdn.com https://assets.pinterest.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://web.squarecdn.com https://sandbox.web.squarecdn.com",
              "font-src 'self' https://fonts.gstatic.com https://square-fonts-production-f.squarecdn.com https://d1g145x70srn7h.cloudfront.net",
              "frame-src 'self' https://*.squarespace.com https://*.square.site https://*.squareup.com https://web.squarecdn.com https://sandbox.web.squarecdn.com",
              "img-src 'self' data: https://*.supabase.co https://cdn.behold.so https://pinimg.com https://i.pinimg.com https://log.pinterest.com https://web.squarecdn.com https://sandbox.web.squarecdn.com",
              "connect-src 'self' https://*.supabase.co https://*.mailchimp.com https://connect.squareup.com https://connect.squareupsandbox.com https://pci-connect.squareup.com https://pci-connect.squareupsandbox.com",
              "frame-ancestors 'self'",
            ].join('; '),
          },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
  // Bundle the watermark font with the /api/gallery/image serverless function.
  // Without this, fs.readFileSync cannot find files in public/ on Vercel Lambda.
  outputFileTracingIncludes: {
    '/api/gallery/image': ['./public/fonts/**'],
  },
  // @resvg/resvg-js uses native .node bindings — mark as external so Turbopack
  // doesn't try to bundle it (which fails on non-ECMAScript assets).
  serverExternalPackages: ['@resvg/resvg-js'],
  images: {
    localPatterns: [
      { pathname: '/gallery/**' },
      { pathname: '/craft/**' },
      { pathname: '/api/gallery/image' },
    ],
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'items-images-sandbox.s3.amazonaws.com' },
      { protocol: 'https', hostname: 'items-images.s3.amazonaws.com' },
    ],
  },
}

module.exports = nextConfig
