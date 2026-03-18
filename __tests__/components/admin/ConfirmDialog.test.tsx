import { render, screen, fireEvent } from '@testing-library/react'
import ConfirmDialog from '@/components/admin/ConfirmDialog'

describe('ConfirmDialog', () => {
  it('renders message text', () => {
    render(<ConfirmDialog message="Delete this event?" onConfirm={jest.fn()} onCancel={jest.fn()} />)
    expect(screen.getByText('Delete this event?')).toBeInTheDocument()
  })
  it('has role="dialog" and aria-modal="true"', () => {
    render(<ConfirmDialog message="Delete?" onConfirm={jest.fn()} onCancel={jest.fn()} />)
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
  })
  it('calls onConfirm when Delete clicked', () => {
    const onConfirm = jest.fn()
    render(<ConfirmDialog message="Delete?" onConfirm={onConfirm} onCancel={jest.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(onConfirm).toHaveBeenCalled()
  })
  it('calls onCancel when Cancel clicked', () => {
    const onCancel = jest.fn()
    render(<ConfirmDialog message="Delete?" onConfirm={jest.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})
