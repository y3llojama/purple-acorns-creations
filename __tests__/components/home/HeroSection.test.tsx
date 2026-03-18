import { render, screen } from '@testing-library/react'
import HeroSection from '@/components/home/HeroSection'

describe('HeroSection', () => {
  it('renders tagline as h1', () => {
    render(<HeroSection tagline="Handcrafted with love" subtext="Brooklyn NY" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Handcrafted with love')
  })
  it('has Shop Now and Our Story links', () => {
    render(<HeroSection tagline="Test" subtext="Test" />)
    expect(screen.getByRole('link', { name: /shop now/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /our story/i })).toBeInTheDocument()
  })
})
