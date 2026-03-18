import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import NewsletterSignup from '@/components/home/NewsletterSignup'

describe('NewsletterSignup', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })
  afterEach(() => {
    jest.resetAllMocks()
  })

  it('renders email input and submit button', () => {
    render(<NewsletterSignup />)
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /subscribe/i })).toBeInTheDocument()
  })

  it('shows success message after successful subscribe', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
    render(<NewsletterSignup />)
    fireEvent.change(screen.getByRole('textbox', { name: /email/i }), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /subscribe/i }))
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
  })

  it('shows error message on failure', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Already subscribed' }) })
    render(<NewsletterSignup />)
    fireEvent.change(screen.getByRole('textbox', { name: /email/i }), { target: { value: 'user@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: /subscribe/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })

  it('validates email before submit — does not call fetch for invalid email', async () => {
    render(<NewsletterSignup />)
    fireEvent.change(screen.getByRole('textbox', { name: /email/i }), { target: { value: 'notvalid' } })
    fireEvent.click(screen.getByRole('button', { name: /subscribe/i }))
    await waitFor(() => expect(global.fetch).not.toHaveBeenCalled())
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
