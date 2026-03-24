import React from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react'
import HeroCarousel from '@/components/modern/HeroCarousel'
import type { HeroSlide } from '@/lib/supabase/types'

// jsdom does not implement matchMedia — provide a default stub (no reduced motion)
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      addListener: jest.fn(),
      removeListener: jest.fn(),
    })),
  })
})

const slide1: HeroSlide = { id: '1', url: 'https://example.com/1.jpg', alt_text: 'Slide one', sort_order: 0 }
const slide2: HeroSlide = { id: '2', url: 'https://example.com/2.jpg', alt_text: 'Slide two', sort_order: 1 }
const slide3: HeroSlide = { id: '3', url: 'https://example.com/3.jpg', alt_text: 'Slide three', sort_order: 2 }

describe('HeroCarousel — single slide', () => {
  it('renders the image', () => {
    render(<HeroCarousel slides={[slide1]} transition="crossfade" intervalMs={5000} />)
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Slide one')
  })

  it('does not render arrows or dots', () => {
    render(<HeroCarousel slides={[slide1]} transition="crossfade" intervalMs={5000} />)
    expect(screen.queryByLabelText('Previous slide')).toBeNull()
    expect(screen.queryByLabelText('Next slide')).toBeNull()
    expect(screen.queryByLabelText('Go to slide 1')).toBeNull()
  })
})

describe('HeroCarousel — multiple slides', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('renders arrows and dots', () => {
    render(<HeroCarousel slides={[slide1, slide2, slide3]} transition="crossfade" intervalMs={5000} />)
    expect(screen.getByLabelText('Previous slide')).toBeInTheDocument()
    expect(screen.getByLabelText('Next slide')).toBeInTheDocument()
    expect(screen.getByLabelText('Go to slide 1')).toBeInTheDocument()
    expect(screen.getByLabelText('Go to slide 2')).toBeInTheDocument()
    expect(screen.getByLabelText('Go to slide 3')).toBeInTheDocument()
  })

  it('advances to next slide after intervalMs', () => {
    render(<HeroCarousel slides={[slide1, slide2]} transition="crossfade" intervalMs={3000} />)
    const dot1 = screen.getByLabelText('Go to slide 1')
    const dot2 = screen.getByLabelText('Go to slide 2')
    expect(dot1).toHaveAttribute('aria-current', 'true')
    act(() => { jest.advanceTimersByTime(3000) })
    expect(dot2).toHaveAttribute('aria-current', 'true')
  })

  it('next arrow click advances the slide', () => {
    render(<HeroCarousel slides={[slide1, slide2]} transition="crossfade" intervalMs={5000} />)
    fireEvent.click(screen.getByLabelText('Next slide'))
    expect(screen.getByLabelText('Go to slide 2')).toHaveAttribute('aria-current', 'true')
  })

  it('dot click jumps to correct slide', () => {
    render(<HeroCarousel slides={[slide1, slide2, slide3]} transition="crossfade" intervalMs={5000} />)
    fireEvent.click(screen.getByLabelText('Go to slide 3'))
    expect(screen.getByLabelText('Go to slide 3')).toHaveAttribute('aria-current', 'true')
  })

  it('mouseenter pauses auto-cycle; mouseleave resumes it', () => {
    const { container } = render(<HeroCarousel slides={[slide1, slide2]} transition="crossfade" intervalMs={2000} />)
    const wrapper = container.firstChild as HTMLElement
    fireEvent.mouseEnter(wrapper)
    act(() => { jest.advanceTimersByTime(4000) })
    expect(screen.getByLabelText('Go to slide 1')).toHaveAttribute('aria-current', 'true')
    fireEvent.mouseLeave(wrapper)
    act(() => { jest.advanceTimersByTime(2000) })
    expect(screen.getByLabelText('Go to slide 2')).toHaveAttribute('aria-current', 'true')
  })
})

describe('HeroCarousel — prefers-reduced-motion', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        addListener: jest.fn(),
        removeListener: jest.fn(),
      })),
    })
  })
  afterEach(() => jest.useRealTimers())

  it('does not auto-cycle when prefers-reduced-motion is set', () => {
    render(<HeroCarousel slides={[slide1, slide2]} transition="crossfade" intervalMs={2000} />)
    act(() => { jest.advanceTimersByTime(4000) })
    expect(screen.getByLabelText('Go to slide 1')).toHaveAttribute('aria-current', 'true')
  })
})
