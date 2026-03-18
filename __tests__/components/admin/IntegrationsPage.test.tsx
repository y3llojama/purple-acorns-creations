import { render, screen } from '@testing-library/react'
import IntegrationsPage from '@/app/admin/integrations/page'

describe('IntegrationsPage', () => {
  it('renders Square URL input', () => {
    render(<IntegrationsPage />)
    expect(screen.getByLabelText(/square store url/i)).toBeInTheDocument()
  })
  it('renders Behold widget ID input', () => {
    render(<IntegrationsPage />)
    expect(screen.getByLabelText(/behold widget id/i)).toBeInTheDocument()
  })
  it('renders social link inputs', () => {
    render(<IntegrationsPage />)
    expect(screen.getByLabelText(/instagram/i)).toBeInTheDocument()
  })
  it('shows "Coming in Phase 2" for AI provider section', () => {
    render(<IntegrationsPage />)
    const matches = screen.getAllByText(/coming in phase 2/i)
    expect(matches.length).toBeGreaterThan(0)
  })
})
