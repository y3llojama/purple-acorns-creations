import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import EventsManager from '@/components/admin/EventsManager'
import type { Event } from '@/lib/supabase/types'

const mockEvent: Event = {
  id: '1',
  name: 'Brooklyn Market',
  date: '2026-04-15',
  time: '10am-4pm',
  location: 'Prospect Park, Brooklyn',
  description: null,
  link_url: null,
  link_label: null,
  created_at: '2026-01-01',
}

describe('EventsManager', () => {
  beforeEach(() => { global.fetch = jest.fn() })
  afterEach(() => jest.resetAllMocks())

  it('renders event name and location', () => {
    render(<EventsManager initialEvents={[mockEvent]} />)
    expect(screen.getByText('Brooklyn Market')).toBeInTheDocument()
    expect(screen.getByText(/Prospect Park/)).toBeInTheDocument()
  })

  it('shows add form when Add New Event button is clicked', () => {
    render(<EventsManager initialEvents={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /add new event/i }))
    expect(screen.getByRole('textbox', { name: /event name/i })).toBeInTheDocument()
  })

  it('form has required name, date, and location fields', () => {
    render(<EventsManager initialEvents={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /add new event/i }))
    expect(screen.getByRole('textbox', { name: /event name/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /location/i })).toBeInTheDocument()
  })
})
