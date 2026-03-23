import { render, screen, fireEvent } from '@testing-library/react'
import MarketsManager from '@/components/admin/MarketsManager'
import type { CraftFair, ArtistVenue, RecurringMarket } from '@/lib/supabase/types'

jest.mock('@/components/admin/DiscoveryProvider', () => ({
  useDiscovery: () => ({ state: 'idle', startDiscovery: jest.fn() }),
}))

const sampleFair: CraftFair = {
  id: '1', name: 'Test Fair', location: 'Boston, MA',
  website_url: null, instagram_url: null, years_in_operation: null,
  avg_artists: null, avg_shoppers: null, typical_months: null,
  notes: null, created_at: '', updated_at: '',
}

const sampleVenue: ArtistVenue = {
  id: '2', name: 'Test Venue', location: 'Providence, RI',
  website_url: null, instagram_url: null, hosting_model: null,
  notes: null, created_at: '', updated_at: '',
}

const sampleMarket: RecurringMarket = {
  id: '3', name: 'Test Market', location: 'Cambridge, MA',
  website_url: null, instagram_url: null, frequency: 'Weekly',
  typical_months: 'May–October', notes: null, created_at: '', updated_at: '',
}

describe('MarketsManager', () => {
  beforeEach(() => { global.fetch = jest.fn() })
  afterEach(() => jest.resetAllMocks())

  it('renders Craft Fairs tab by default', () => {
    render(<MarketsManager initialFairs={[sampleFair]} initialVenues={[sampleVenue]} initialMarkets={[sampleMarket]} />)
    expect(screen.getByText(/Craft Fairs/)).toBeInTheDocument()
    expect(screen.getByText('Test Fair')).toBeInTheDocument()
    expect(screen.queryByText('Test Venue')).not.toBeInTheDocument()
    expect(screen.queryByText('Test Market')).not.toBeInTheDocument()
  })

  it('tab switch shows Stores & Collectives', () => {
    render(<MarketsManager initialFairs={[sampleFair]} initialVenues={[sampleVenue]} initialMarkets={[sampleMarket]} />)
    fireEvent.click(screen.getByText(/Stores & Collectives/))
    expect(screen.getByText('Test Venue')).toBeInTheDocument()
    expect(screen.queryByText('Test Fair')).not.toBeInTheDocument()
  })

  it('tab switch shows Recurring Markets', () => {
    render(<MarketsManager initialFairs={[sampleFair]} initialVenues={[sampleVenue]} initialMarkets={[sampleMarket]} />)
    fireEvent.click(screen.getByText(/Recurring Markets/))
    expect(screen.getByText('Test Market')).toBeInTheDocument()
    expect(screen.queryByText('Test Fair')).not.toBeInTheDocument()
  })

  it('search filters the active tab', () => {
    const secondFair: CraftFair = { ...sampleFair, id: '4', name: 'Winter Bazaar', location: 'Cambridge, MA' }
    render(<MarketsManager initialFairs={[sampleFair, secondFair]} initialVenues={[]} initialMarkets={[]} />)
    const searchInput = screen.getByRole('searchbox')
    fireEvent.change(searchInput, { target: { value: 'Winter' } })
    expect(screen.getByText('Winter Bazaar')).toBeInTheDocument()
    expect(screen.queryByText('Test Fair')).not.toBeInTheDocument()
  })

  it('+ Add New button shows the form', () => {
    render(<MarketsManager initialFairs={[]} initialVenues={[]} initialMarkets={[]} />)
    expect(screen.queryByLabelText(/Name \*/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /\+ Add New/i }))
    expect(screen.getByLabelText(/Name \*/i)).toBeInTheDocument()
  })
})
