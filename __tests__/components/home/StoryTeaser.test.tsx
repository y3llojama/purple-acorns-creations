import { render, screen } from '@testing-library/react'
import StoryTeaser from '@/components/home/StoryTeaser'

describe('StoryTeaser', () => {
  it('renders Our Story heading', () => {
    render(<StoryTeaser teaser="We started in a small Brooklyn apartment." />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Our Story')
  })

  it('renders teaser text', () => {
    render(<StoryTeaser teaser="We started in a small Brooklyn apartment." />)
    expect(screen.getByText('We started in a small Brooklyn apartment.')).toBeInTheDocument()
  })

  it('has link to /our-story', () => {
    render(<StoryTeaser teaser="Test" />)
    expect(screen.getByRole('link', { name: /read full story/i })).toHaveAttribute('href', '/our-story')
  })
})
