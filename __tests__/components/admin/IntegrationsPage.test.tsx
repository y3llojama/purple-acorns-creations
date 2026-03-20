import { render, screen } from '@testing-library/react'
import IntegrationsEditor from '@/components/admin/IntegrationsEditor'

// Mock FollowAlongManager to avoid Supabase client dependency
jest.mock('@/components/admin/FollowAlongManager', () => ({
  __esModule: true,
  default: () => <div data-testid="follow-along-manager">FollowAlongManager</div>,
}))

describe('IntegrationsEditor', () => {
  const defaultProps = {
    initialMode: 'widget' as const,
    initialPhotos: [],
    initialResendApiKey: '',
    initialNewsletterFromName: '',
    initialNewsletterFromEmail: '',
    initialNewsletterAdminEmails: '',
    initialNewsletterSendTime: '10:00',
    initialAiProvider: '',
    initialAiApiKey: '',
  }

  it('renders Square URL input', () => {
    render(<IntegrationsEditor {...defaultProps} />)
    expect(screen.getByLabelText(/square store url/i)).toBeInTheDocument()
  })
  it('renders Behold widget ID input', () => {
    render(<IntegrationsEditor {...defaultProps} />)
    expect(screen.getByLabelText(/behold widget id/i)).toBeInTheDocument()
  })
  it('renders social link inputs', () => {
    render(<IntegrationsEditor {...defaultProps} />)
    expect(screen.getByLabelText(/instagram/i)).toBeInTheDocument()
  })
  it('renders Resend API key input', () => {
    render(<IntegrationsEditor {...defaultProps} />)
    expect(screen.getByLabelText(/resend api key/i)).toBeInTheDocument()
  })
  it('renders AI provider select', () => {
    render(<IntegrationsEditor {...defaultProps} />)
    expect(screen.getByLabelText(/provider/i)).toBeInTheDocument()
  })
  it('renders Follow Along Manager', () => {
    render(<IntegrationsEditor {...defaultProps} />)
    expect(screen.getByTestId('follow-along-manager')).toBeInTheDocument()
  })
})
