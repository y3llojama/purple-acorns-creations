import { render, screen } from '@testing-library/react'
import AdminSidebar from '@/components/admin/AdminSidebar'
// Mock usePathname
jest.mock('next/navigation', () => ({ usePathname: () => '/admin', useRouter: () => ({ push: jest.fn() }) }))

describe('AdminSidebar', () => {
  it('renders all main nav items', () => {
    render(<AdminSidebar />)
    expect(screen.getByText(/Dashboard/)).toBeInTheDocument()
    expect(screen.getByText(/Content/)).toBeInTheDocument()
    expect(screen.getByText(/Events/)).toBeInTheDocument()
    expect(screen.getByText(/Gallery/)).toBeInTheDocument()
  })
  it('marks current page with aria-current="page"', () => {
    render(<AdminSidebar />)
    expect(screen.getByRole('link', { name: /Dashboard/ })).toHaveAttribute('aria-current', 'page')
  })
})
