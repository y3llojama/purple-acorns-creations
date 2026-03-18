import type { Theme } from '@/lib/supabase/types'

describe('Supabase types', () => {
  it('Theme accepts warm-artisan', () => {
    const t: Theme = 'warm-artisan'
    expect(t).toBe('warm-artisan')
  })
  it('Theme accepts soft-botanical', () => {
    const t: Theme = 'soft-botanical'
    expect(t).toBe('soft-botanical')
  })
})
