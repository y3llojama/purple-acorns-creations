import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import BrandingEditor from '@/components/admin/BrandingEditor'
import type { Settings } from '@/lib/supabase/types'

const mockRefresh = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

jest.mock('@/components/admin/ImageUploader', () => ({
  __esModule: true,
  default: ({ onUpload, label }: { onUpload: (url: string, alt: string) => void; label: string }) => (
    <button data-testid="image-uploader" onClick={() => onUpload('https://example.com/img.jpg', '')}>
      {label}
    </button>
  ),
}))

jest.mock('@/components/admin/HeroSlideList', () => ({
  __esModule: true,
  default: () => <div data-testid="hero-slide-list" />,
}))

jest.mock('@/components/admin/SiteMap', () => ({
  __esModule: true,
  default: ({ label }: { label: string }) => (
    <div data-testid={`sitemap-${label.toLowerCase().replace(/\s+/g, '-')}`}>{label}</div>
  ),
}))

jest.mock('@/lib/color', () => ({
  deriveCustomThemeVars: jest.fn(() => ({
    '--color-primary':    '#2d1b4e',
    '--color-accent':     '#d4a853',
    '--color-bg':         'hsl(270, 20%, 85%)',
    '--color-surface':    'hsl(270, 15%, 92%)',
    '--color-text':       'hsl(270, 40%, 10%)',
    '--color-text-muted': 'hsl(270, 25%, 40%)',
    '--color-border':     'hsl(270, 22%, 78%)',
    '--color-secondary':  'hsl(40, 35%, 55%)',
    '--color-focus':      '#d4a853',
  })),
}))

const mockSettings: Partial<Settings> = {
  theme: 'warm-artisan',
  custom_primary: null,
  custom_accent: null,
  hero_image_url: null,
  hero_transition: 'crossfade',
  hero_interval_ms: 5000,
  announcement_enabled: false,
  announcement_text: null,
  announcement_link_url: null,
  announcement_link_label: null,
  logo_url: null,
}

describe('BrandingEditor', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true })
  })
  afterEach(() => jest.resetAllMocks())

  // — Theme section —

  it('renders 8 preset swatches', () => {
    render(<BrandingEditor settings={mockSettings as Settings} />)
    expect(screen.getByText('Warm Artisan')).toBeInTheDocument()
    expect(screen.getByText('Soft Botanical')).toBeInTheDocument()
    expect(screen.getByText('Forest Dusk')).toBeInTheDocument()
    expect(screen.getByText('Rose & Rust')).toBeInTheDocument()
    expect(screen.getByText('Midnight Ink')).toBeInTheDocument()
    expect(screen.getByText('Mauve Bloom')).toBeInTheDocument()
    expect(screen.getByText('Harvest Gold')).toBeInTheDocument()
    expect(screen.getByText('Slate & Sage')).toBeInTheDocument()
  })

  it('warm artisan is active on mount when theme is warm-artisan', () => {
    render(<BrandingEditor settings={mockSettings as Settings} />)
    expect(screen.getByRole('button', { name: /warm artisan/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /soft botanical/i })).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicking a different preset marks it active, populates pickers, and resets saved status', async () => {
    render(<BrandingEditor settings={mockSettings as Settings} />)
    // First save so themeSaved is true
    fireEvent.click(screen.getByRole('button', { name: /save theme/i }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: /soft botanical/i }))
    expect(screen.getByRole('button', { name: /soft botanical/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText(/primary/i)).toHaveValue('#3d2b4e')
    expect(screen.getByLabelText(/accent/i)).toHaveValue('#9b7bb8')
    expect(screen.queryByText(/saved/i)).not.toBeInTheDocument()
  })

  it('changing a color picker resets saved status', async () => {
    render(<BrandingEditor settings={mockSettings as Settings} />)
    fireEvent.click(screen.getByRole('button', { name: /save theme/i }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText(/primary/i), { target: { value: '#ff0000' } })
    expect(screen.queryByText(/saved/i)).not.toBeInTheDocument()
  })

  it('save button with named preset posts correct payload', async () => {
    render(<BrandingEditor settings={mockSettings as Settings} />)
    fireEvent.click(screen.getByRole('button', { name: /save theme/i }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/settings',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ theme: 'warm-artisan', custom_primary: null, custom_accent: null }),
      })
    ))
  })

  it('save button with custom preset posts theme=custom with hex values', async () => {
    render(<BrandingEditor settings={mockSettings as Settings} />)
    fireEvent.click(screen.getByRole('button', { name: /forest dusk/i }))
    fireEvent.click(screen.getByRole('button', { name: /save theme/i }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/settings',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ theme: 'custom', custom_primary: '#1a3d2b', custom_accent: '#c8a86b' }),
      })
    ))
  })

  it('on mount with custom theme matching a preset, that preset is shown as active', () => {
    const customSettings = {
      ...mockSettings,
      theme: 'custom' as const,
      custom_primary: '#1a3d2b',
      custom_accent: '#c8a86b',
    }
    render(<BrandingEditor settings={customSettings as Settings} />)
    expect(screen.getByRole('button', { name: /forest dusk/i })).toHaveAttribute('aria-pressed', 'true')
  })

  // — Logo section —

  it('renders the site map for the Logo section', () => {
    render(<BrandingEditor settings={mockSettings as Settings} />)
    expect(screen.getByTestId('sitemap-site-header')).toBeInTheDocument()
  })

  // — Hero Image section —

  it('renders the Hero Image section with SiteMap', () => {
    render(<BrandingEditor settings={mockSettings as Settings} />)
    expect(screen.getByTestId('sitemap-hero-section')).toBeInTheDocument()
  })

  it('Save Settings button posts hero_transition and hero_interval_ms to settings', async () => {
    render(<BrandingEditor settings={mockSettings as Settings} />)
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/admin/settings',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ hero_transition: 'crossfade', hero_interval_ms: 5000 }),
      })
    ))
  })

  // — Announcement section —

  it('announcement toggle is a checkbox with label', () => {
    render(<BrandingEditor settings={mockSettings as Settings} />)
    expect(screen.getByRole('checkbox', { name: /show announcement/i })).toBeInTheDocument()
  })

  it('renders the site map for the Announcement Banner section', () => {
    render(<BrandingEditor settings={mockSettings as Settings} />)
    expect(screen.getByTestId('sitemap-announcement-bar')).toBeInTheDocument()
  })
})
