import { render, screen } from '@testing-library/react'
import FeaturedPieces from '@/components/home/FeaturedPieces'
import type { FeaturedProduct } from '@/lib/supabase/types'

const mockProducts: FeaturedProduct[] = [
  {
    id: '1',
    name: 'Amethyst Ring',
    price: 45.00,
    description: 'A beautiful amethyst ring',
    image_url: 'https://example.com/ring.jpg',
    square_url: 'https://square.com/item/1',
    sort_order: 1,
    is_active: true,
  },
  {
    id: '2',
    name: 'Pearl Necklace',
    price: 78.50,
    description: null,
    image_url: 'https://example.com/necklace.jpg',
    square_url: null,
    sort_order: 2,
    is_active: true,
  },
]

describe('FeaturedPieces', () => {
  it('renders product name and price', () => {
    render(<FeaturedPieces products={mockProducts} />)
    expect(screen.getByText('Amethyst Ring')).toBeInTheDocument()
    expect(screen.getByText('$45.00')).toBeInTheDocument()
    expect(screen.getByText('Pearl Necklace')).toBeInTheDocument()
    expect(screen.getByText('$78.50')).toBeInTheDocument()
  })

  it('renders View All link to /shop', () => {
    render(<FeaturedPieces products={mockProducts} />)
    expect(screen.getByRole('link', { name: /view all/i })).toHaveAttribute('href', '/shop')
  })

  it('renders just the section with View All link when products array is empty', () => {
    render(<FeaturedPieces products={[]} />)
    expect(screen.getByRole('link', { name: /view all/i })).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })
})
