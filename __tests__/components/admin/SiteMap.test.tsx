import { render, screen } from '@testing-library/react'
import SiteMap from '@/components/admin/SiteMap'

describe('SiteMap', () => {
  it('renders the wireframe container', () => {
    render(<SiteMap highlight="hero" label="Hero Section" description="The large opening section." />)
    expect(screen.getByTestId('sitemap-wireframe')).toBeInTheDocument()
  })

  it('renders the pill label on the highlighted zone', () => {
    const { container } = render(<SiteMap highlight="hero" label="Hero Section" description="desc" />)
    // Pill is aria-hidden; query directly from DOM
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('Hero Section')
  })

  it('renders the description text below the wireframe', () => {
    render(<SiteMap highlight="announcement" label="Announcement Bar" description="Shown at the top of every page." />)
    expect(screen.getByText('Shown at the top of every page.')).toBeInTheDocument()
  })

  it('renders homepage zones for standard highlights', () => {
    render(<SiteMap highlight="gallery" label="Gallery Strip" description="desc" />)
    expect(screen.getByTestId('sitemap-zone-gallery')).toBeInTheDocument()
    expect(screen.getByTestId('sitemap-zone-hero')).toBeInTheDocument()
    expect(screen.getByTestId('sitemap-zone-footer')).toBeInTheDocument()
  })

  it('renders the our-story variant with only two zones', () => {
    render(<SiteMap highlight="our-story" label="Our Story Page" description="desc" />)
    expect(screen.getByTestId('sitemap-zone-our-story')).toBeInTheDocument()
    expect(screen.getByTestId('sitemap-zone-header')).toBeInTheDocument()
    expect(screen.queryByTestId('sitemap-zone-hero')).not.toBeInTheDocument()
  })
})
