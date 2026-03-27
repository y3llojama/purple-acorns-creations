/**
 * @jest-environment node
 */
import { generateSlug } from '@/lib/slug'

describe('generateSlug', () => {
  it('generates slug from category names', () => {
    const slug = generateSlug(['Rings', 'Necklaces', 'Earrings'])
    expect(slug).toMatch(/^rings-necklaces-earrings-[a-z0-9]{8}$/)
  })

  it('limits to 3 descriptors', () => {
    const slug = generateSlug(['Rings', 'Necklaces', 'Earrings', 'Bracelets'])
    expect(slug).toMatch(/^rings-necklaces-earrings-[a-z0-9]{8}$/)
  })

  it('falls back to "favorites" when no descriptors', () => {
    const slug = generateSlug([])
    expect(slug).toMatch(/^favorites-[a-z0-9]{8}$/)
  })

  it('strips non-alphanumeric characters', () => {
    const slug = generateSlug(["Mom's Picks", 'Best & Brightest'])
    expect(slug).toMatch(/^moms-picks-best-brightest-[a-z0-9]{8}$/)
  })

  it('truncates long descriptors to fit 60 char max', () => {
    const slug = generateSlug(['Very Long Category Name That Keeps Going', 'Another Long One Here Too'])
    expect(slug.length).toBeLessThanOrEqual(60)
  })

  it('generates unique slugs on repeated calls', () => {
    const slugs = new Set(Array.from({ length: 20 }, () => generateSlug(['Rings'])))
    expect(slugs.size).toBe(20)
  })
})
