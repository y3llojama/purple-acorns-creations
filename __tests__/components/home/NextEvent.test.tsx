import { render, screen } from '@testing-library/react'
import NextEvent from '@/components/home/NextEvent'
import type { Event } from '@/lib/supabase/types'

const mockEvent: Event = {
  id: '1',
  name: 'Brooklyn Craft Fair',
  date: '2026-03-20',
  time: '10:00 AM',
  location: 'Brooklyn NY',
  description: 'Come see us at the fair!',
  link_url: 'https://example.com/fair',
  link_label: 'Get Tickets',
  created_at: '2026-01-01T00:00:00Z',
}

describe('NextEvent', () => {
  it('renders event name and location', () => {
    render(<NextEvent event={mockEvent} />)
    expect(screen.getByText('Brooklyn Craft Fair')).toBeInTheDocument()
    expect(screen.getByText('Brooklyn NY')).toBeInTheDocument()
  })

  it('renders nothing when event is null', () => {
    const { container } = render(<NextEvent event={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders optional link button when link_url is set (valid https URL)', () => {
    render(<NextEvent event={mockEvent} />)
    expect(screen.getByRole('link', { name: /get tickets/i })).toHaveAttribute('href', 'https://example.com/fair')
  })

  it('does not render link when link_url is non-https', () => {
    const eventWithBadUrl: Event = { ...mockEvent, link_url: 'http://example.com/fair' }
    render(<NextEvent event={eventWithBadUrl} />)
    expect(screen.queryByRole('link', { name: /get tickets/i })).not.toBeInTheDocument()
  })
})
