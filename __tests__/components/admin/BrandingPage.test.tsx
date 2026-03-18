import { render, screen, fireEvent } from '@testing-library/react'
import BrandingEditor from '@/components/admin/BrandingEditor'
import type { Settings } from '@/lib/supabase/types'

jest.mock('@/components/admin/ImageUploader', () => ({
  __esModule: true,
  default: () => <div data-testid="image-uploader">ImageUploader</div>,
}))

const mockSettings: Partial<Settings> = {
  theme: 'warm-artisan',
  announcement_enabled: false,
  announcement_text: null,
  announcement_link_url: null,
  announcement_link_label: null,
  logo_url: null,
}

describe('BrandingEditor', () => {
  beforeEach(() => { global.fetch = jest.fn() })
  afterEach(() => jest.resetAllMocks())

  it('renders two theme option cards', () => {
    render(<BrandingEditor settings={mockSettings as Settings} />)
    expect(screen.getByText(/warm artisan/i)).toBeInTheDocument()
    expect(screen.getByText(/soft botanical/i)).toBeInTheDocument()
  })

  it('announcement toggle is a checkbox with label', () => {
    render(<BrandingEditor settings={mockSettings as Settings} />)
    expect(screen.getByRole('checkbox', { name: /show announcement/i })).toBeInTheDocument()
  })
})
