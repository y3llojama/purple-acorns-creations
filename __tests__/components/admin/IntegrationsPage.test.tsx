import { render, screen } from '@testing-library/react'
import IntegrationsEditor from '@/components/admin/IntegrationsEditor'

// Mock FollowAlongManager to avoid Supabase client dependency
jest.mock('@/components/admin/FollowAlongManager', () => ({
  __esModule: true,
  default: () => <div data-testid="follow-along-manager">FollowAlongManager</div>,
}))

describe('IntegrationsEditor', () => {
  const defaultProps = { initialMode: 'widget' as const, initialPhotos: [] }

  it('renders Behold widget ID input', () => {
    render(<IntegrationsEditor {...defaultProps} />)
    expect(screen.getByLabelText(/behold widget id/i)).toBeInTheDocument()
  })
  it('renders social link inputs', () => {
    render(<IntegrationsEditor {...defaultProps} />)
    expect(screen.getByLabelText(/instagram/i)).toBeInTheDocument()
  })
  it('shows "Coming in Phase 2" for AI provider section', () => {
    render(<IntegrationsEditor {...defaultProps} />)
    const matches = screen.getAllByText(/coming in phase 2/i)
    expect(matches.length).toBeGreaterThan(0)
  })
  it('renders Follow Along Manager', () => {
    render(<IntegrationsEditor {...defaultProps} />)
    expect(screen.getByTestId('follow-along-manager')).toBeInTheDocument()
  })
})
