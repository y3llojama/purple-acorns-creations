import { render, screen } from '@testing-library/react'
import GalleryStrip from '@/components/home/GalleryStrip'
import type { GalleryItem } from '@/lib/supabase/types'

const mockItems: GalleryItem[] = [
  {
    id: '1',
    url: 'https://example.com/photo1.jpg',
    alt_text: 'Handcrafted bracelet',
    category: 'bracelets',
    sort_order: 1,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: '2',
    url: 'https://example.com/photo2.jpg',
    alt_text: 'Amethyst ring',
    category: 'rings',
    sort_order: 2,
    created_at: '2026-01-02T00:00:00Z',
  },
]

describe('GalleryStrip', () => {
  it('renders an image for each gallery item with correct alt text', () => {
    render(<GalleryStrip items={mockItems} />)
    expect(screen.getByAltText('Handcrafted bracelet')).toBeInTheDocument()
    expect(screen.getByAltText('Amethyst ring')).toBeInTheDocument()
  })

  it('renders nothing when items array is empty', () => {
    const { container } = render(<GalleryStrip items={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
