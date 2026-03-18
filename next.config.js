/** @type {import('next').NextConfig} */
const nextConfig = {
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
              "script-src 'self' 'unsafe-inline' https://w.behold.so",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "frame-src 'self' https://*.squarespace.com https://*.square.site https://*.squareup.com",
              "img-src 'self' data: https://*.supabase.co https://cdn.behold.so https://live.staticflickr.com",
              "connect-src 'self' https://*.supabase.co https://*.mailchimp.com",
              "frame-ancestors 'self'",
            ].join('; '),
          },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'live.staticflickr.com' },
    ],
  },
}

module.exports = nextConfig
