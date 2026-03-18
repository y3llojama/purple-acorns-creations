import { render, screen, fireEvent } from '@testing-library/react'
import AnnouncementBanner from '@/components/layout/AnnouncementBanner'

describe('AnnouncementBanner', () => {
  it('renders announcement text', () => {
    render(<AnnouncementBanner text="Come find us at the fair!" linkUrl={null} linkLabel={null} />)
    expect(screen.getByText('Come find us at the fair!')).toBeInTheDocument()
  })
  it('has correct ARIA role', () => {
    render(<AnnouncementBanner text="Hello" linkUrl={null} linkLabel={null} />)
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })
  it('dismisses when button clicked', () => {
    render(<AnnouncementBanner text="Hello" linkUrl={null} linkLabel={null} />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByText('Hello')).not.toBeInTheDocument()
  })
  it('renders link with noopener rel when provided', () => {
    render(<AnnouncementBanner text="Event" linkUrl="https://example.com" linkLabel="Learn more" />)
    const link = screen.getByRole('link', { name: 'Learn more' })
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
  it('does not render link for non-https URL', () => {
    render(<AnnouncementBanner text="Event" linkUrl="javascript:alert(1)" linkLabel="Click" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
