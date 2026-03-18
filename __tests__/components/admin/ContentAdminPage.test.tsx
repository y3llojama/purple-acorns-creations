import { render, screen } from '@testing-library/react'
import ContentAdminPage from '@/app/admin/content/page'

jest.mock('@/lib/content', () => ({
  getAllContent: jest.fn().mockResolvedValue({
    hero_tagline: '', hero_subtext: '', story_teaser: '',
    story_full: '', privacy_policy: '', terms_of_service: '',
  }),
}))

jest.mock('@/components/admin/ContentEditor', () => ({
  __esModule: true,
  default: ({ label }: { label: string }) => <div>{label}</div>,
}))

jest.mock('@/components/admin/SiteMap', () => ({
  __esModule: true,
  default: ({ label }: { label: string }) => (
    <div data-testid={`sitemap-${label.toLowerCase().replace(/\s+/g, '-')}`}>{label}</div>
  ),
}))

describe('ContentAdminPage', () => {
  it('renders the hero section site map', async () => {
    render(await ContentAdminPage())
    expect(screen.getByTestId('sitemap-hero-section')).toBeInTheDocument()
  })

  it('renders the story teaser site map', async () => {
    render(await ContentAdminPage())
    expect(screen.getByTestId('sitemap-story-teaser')).toBeInTheDocument()
  })

  it('renders the our story page site map', async () => {
    render(await ContentAdminPage())
    expect(screen.getByTestId('sitemap-our-story-page')).toBeInTheDocument()
  })

  it('does not render a site map for legal fields', async () => {
    render(await ContentAdminPage())
    expect(screen.queryByTestId('sitemap-privacy-policy')).not.toBeInTheDocument()
  })
})
