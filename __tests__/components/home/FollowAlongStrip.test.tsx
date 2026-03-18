import { render, screen } from '@testing-library/react'
import FollowAlongStrip from '@/components/home/FollowAlongStrip'
import type { FollowAlongPhoto } from '@/lib/supabase/types'

const makePhotos = (n: number): FollowAlongPhoto[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `photo-${i}`,
    storage_path: `https://example.com/photo-${i}.jpg`,
    display_order: i,
    created_at: new Date().toISOString(),
  }))

describe('FollowAlongStrip', () => {
  it('renders the CTA with Instagram handle', () => {
    render(<FollowAlongStrip photos={makePhotos(3)} handle="purpleacornz" />)
    expect(screen.getByText('@purpleacornz')).toBeInTheDocument()
    expect(screen.getByText('Follow Along')).toBeInTheDocument()
  })

  it('links to Instagram profile', () => {
    render(<FollowAlongStrip photos={makePhotos(2)} handle="purpleacornz" />)
    const link = screen.getByText('@purpleacornz').closest('a')
    expect(link).toHaveAttribute('href', 'https://instagram.com/purpleacornz')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders photos as decorative images', () => {
    render(<FollowAlongStrip photos={makePhotos(3)} handle="test" />)
    const images = screen.getAllByRole('presentation')
    expect(images.length).toBe(3)
  })

  it('duplicates photos for scroll when 5+', () => {
    render(<FollowAlongStrip photos={makePhotos(6)} handle="test" />)
    // 6 photos duplicated = 12 presentation images
    const images = screen.getAllByRole('presentation')
    expect(images.length).toBe(12)
  })
})
