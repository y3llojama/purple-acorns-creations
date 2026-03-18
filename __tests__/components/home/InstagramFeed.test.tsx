import { render, screen } from '@testing-library/react'
import InstagramFeed from '@/components/home/InstagramFeed'

describe('InstagramFeed', () => {
  it('renders fallback Instagram link when widgetId is null', () => {
    render(<InstagramFeed widgetId={null} handle="purpleacornz" />)
    const link = screen.getByRole('link', { name: /follow us on instagram/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', 'https://instagram.com/purpleacornz')
  })

  it('uses default handle when handle is null', () => {
    render(<InstagramFeed widgetId={null} handle={null} />)
    const link = screen.getByRole('link', { name: /follow us on instagram/i })
    expect(link).toHaveAttribute('href', 'https://instagram.com/purpleacornz')
  })

  it('renders Behold widget div when widgetId is set', () => {
    const { container } = render(<InstagramFeed widgetId="abc123" handle="purpleacornz" />)
    const widget = container.querySelector('.behold-widget')
    expect(widget).toBeInTheDocument()
    expect(widget).toHaveAttribute('data-behold-id', 'abc123')
  })
})
