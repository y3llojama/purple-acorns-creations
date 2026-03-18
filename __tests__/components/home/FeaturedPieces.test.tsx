import { render, screen } from '@testing-library/react'
import FeaturedPieces from '@/components/home/FeaturedPieces'
import type { GalleryItem } from '@/lib/supabase/types'

const mockItems: GalleryItem[] = [
  {
    id: '1',
    url: 'https://example.com/ring.jpg',
    alt_text: 'Amethyst Ring',
    category: 'rings',
    sort_order: 1,
    is_featured: true,
    square_url: 'https://squareup.com/store/ring-1',
    created_at: '2026-01-01',
  },
  {
    id: '2',
    url: 'https://example.com/necklace.jpg',
    alt_text: 'Pearl Necklace',
    category: 'necklaces',
    sort_order: 2,
    is_featured: true,
    square_url: null,
    created_at: '2026-01-01',
  },
]

describe('FeaturedPieces', () => {
  it('renders item descriptions', () => {
    render(<FeaturedPieces items={mockItems} />)
    expect(screen.getByText('Amethyst Ring')).toBeInTheDocument()
    expect(screen.getByText('Pearl Necklace')).toBeInTheDocument()
  })

  it('renders nothing when items array is empty', () => {
    const { container } = render(<FeaturedPieces items={[]} />)
    expect(container.innerHTML).toBe('')
  })
})
