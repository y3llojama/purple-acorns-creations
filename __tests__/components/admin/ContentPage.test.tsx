import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ContentEditor from '@/components/admin/ContentEditor'

describe('ContentEditor', () => {
  beforeEach(() => {
    global.fetch = jest.fn()
  })
  afterEach(() => jest.resetAllMocks())

  it('renders a textarea with the current value', () => {
    render(<ContentEditor contentKey="hero_tagline" label="Hero Tagline" initialValue="Hello world" rows={2} />)
    expect(screen.getByRole('textbox', { name: /hero tagline/i })).toHaveValue('Hello world')
  })

  it('renders a Save button', () => {
    render(<ContentEditor contentKey="hero_tagline" label="Hero Tagline" initialValue="" rows={2} />)
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })

  it('shows "Saved ✓" after successful save', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
    render(<ContentEditor contentKey="hero_tagline" label="Hero Tagline" initialValue="" rows={2} />)
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(screen.getByText(/saved/i)).toBeInTheDocument())
  })
})
