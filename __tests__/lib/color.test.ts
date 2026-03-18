import { deriveCustomThemeVars, ThemeVars } from '@/lib/color'

const HSL_RE = /^hsl\(\d+, \d+%, \d+%\)$/
const PRIMARY = '#2d1b4e'
const ACCENT  = '#d4a853'

describe('deriveCustomThemeVars', () => {
  it('returns all 9 CSS variable keys', () => {
    const vars = deriveCustomThemeVars(PRIMARY, ACCENT)
    expect(Object.keys(vars)).toHaveLength(9)
  })

  it('--color-primary equals primary input', () => {
    expect(deriveCustomThemeVars(PRIMARY, ACCENT)['--color-primary']).toBe(PRIMARY)
  })

  it('--color-accent equals accent input', () => {
    expect(deriveCustomThemeVars(PRIMARY, ACCENT)['--color-accent']).toBe(ACCENT)
  })

  it('--color-focus equals accent input', () => {
    expect(deriveCustomThemeVars(PRIMARY, ACCENT)['--color-focus']).toBe(ACCENT)
  })

  it('derived variables are hsl() strings', () => {
    const vars = deriveCustomThemeVars(PRIMARY, ACCENT)
    const derived: Array<keyof ThemeVars> = [
      '--color-bg', '--color-surface', '--color-text',
      '--color-text-muted', '--color-border', '--color-secondary',
    ]
    for (const key of derived) {
      expect(vars[key]).toMatch(HSL_RE)
    }
  })

  it('--color-bg lightness is higher than --color-text lightness', () => {
    const vars = deriveCustomThemeVars(PRIMARY, ACCENT)
    const bgL   = parseInt(vars['--color-bg'].match(/(\d+)%\)$/)![1])
    const textL = parseInt(vars['--color-text'].match(/(\d+)%\)$/)![1])
    expect(bgL).toBeGreaterThan(textL)
  })

  it('throws TypeError for invalid primary hex', () => {
    expect(() => deriveCustomThemeVars('not-a-color', ACCENT)).toThrow(TypeError)
  })

  it('throws TypeError for invalid accent hex', () => {
    expect(() => deriveCustomThemeVars(PRIMARY, 'bad')).toThrow(TypeError)
  })

  it('throws TypeError for 3-digit shorthand hex', () => {
    expect(() => deriveCustomThemeVars('#fff', ACCENT)).toThrow(TypeError)
  })

  it('accepts uppercase hex', () => {
    expect(() => deriveCustomThemeVars('#2D1B4E', '#D4A853')).not.toThrow()
  })
})
