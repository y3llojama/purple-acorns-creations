import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Purple Acorns Creations',
    short_name: 'Purple Acorns',
    description: 'Handcrafted jewelry by a mother-daughter duo.',
    start_url: '/admin',
    display: 'standalone',
    background_color: '#f5ede0',
    theme_color: '#2d1b4e',
  }
}
