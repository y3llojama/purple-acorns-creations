import { render, screen } from '@testing-library/react'
import InstagramFeed from '@/components/home/InstagramFeed'
import type { FollowAlongPhoto } from '@/lib/supabase/types'

// Mock FollowAlongStrip
jest.mock('@/components/home/FollowAlongStrip', () => ({
  __esModule: true,
  default: ({ handle }: { handle: string }) => <div data-testid="follow-along-strip">@{handle}</div>,
}))

const photos: FollowAlongPhoto[] = [
  { id: '1', storage_path: 'https://example.com/1.jpg', display_order: 0, created_at: '' },
  { id: '2', storage_path: 'https://example.com/2.jpg', display_order: 1, created_at: '' },
]

describe('InstagramFeed', () => {
  it('renders fallback Instagram link when widgetId is null', () => {
    render(<InstagramFeed widgetId={null} handle="purpleacornz" followAlongMode="widget" followAlongPhotos={[]} />)
    const link = screen.getByRole('link', { name: /follow us on instagram/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', 'https://instagram.com/purpleacornz')
  })

  it('uses default handle when handle is null', () => {
    render(<InstagramFeed widgetId={null} handle={null} followAlongMode="widget" followAlongPhotos={[]} />)
    const link = screen.getByRole('link', { name: /follow us on instagram/i })
    expect(link).toHaveAttribute('href', 'https://instagram.com/purpleacornz')
  })

  it('renders Behold widget div when widgetId is set', () => {
    const { container } = render(<InstagramFeed widgetId="abc123" handle="purpleacornz" followAlongMode="widget" followAlongPhotos={[]} />)
    const widget = container.querySelector('.behold-widget')
    expect(widget).toBeInTheDocument()
    expect(widget).toHaveAttribute('data-behold-id', 'abc123')
  })

  it('renders gallery strip in gallery mode with photos', () => {
    render(<InstagramFeed widgetId={null} handle="purpleacornz" followAlongMode="gallery" followAlongPhotos={photos} />)
    expect(screen.getByTestId('follow-along-strip')).toBeInTheDocument()
  })

  it('falls back to Instagram link when gallery mode but no photos', () => {
    render(<InstagramFeed widgetId={null} handle="purpleacornz" followAlongMode="gallery" followAlongPhotos={[]} />)
    expect(screen.getByText(/follow us on instagram/i)).toBeInTheDocument()
  })
})
