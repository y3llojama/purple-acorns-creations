import { render, screen } from '@testing-library/react'
import GalleryManager from '@/components/admin/GalleryManager'
import type { GalleryItem } from '@/lib/supabase/types'

// Mock ImageUploader since it uses Supabase client
jest.mock('@/components/admin/ImageUploader', () => ({
  __esModule: true,
  default: () => <div data-testid="image-uploader">ImageUploader</div>,
}))

const mockItems: GalleryItem[] = [
  { id: '1', url: 'https://example.com/photo1.jpg', alt_text: 'A silver ring', category: 'rings', sort_order: 0, created_at: '2026-01-01' },
  { id: '2', url: 'https://example.com/photo2.jpg', alt_text: 'A necklace', category: 'necklaces', sort_order: 1, created_at: '2026-01-02' },
]

describe('GalleryManager', () => {
  it('renders ImageUploader', () => {
    render(<GalleryManager initialItems={[]} />)
    expect(screen.getByTestId('image-uploader')).toBeInTheDocument()
  })
  it('renders each gallery item alt text', () => {
    render(<GalleryManager initialItems={mockItems} />)
    expect(screen.getByText('A silver ring')).toBeInTheDocument()
    expect(screen.getByText('A necklace')).toBeInTheDocument()
  })
  it('each item has a delete button with accessible label', () => {
    render(<GalleryManager initialItems={mockItems} />)
    expect(screen.getByRole('button', { name: /delete.*silver ring/i })).toBeInTheDocument()
  })
})
