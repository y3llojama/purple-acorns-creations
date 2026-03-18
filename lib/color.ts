export interface ThemeVars {
  '--color-primary':    string
  '--color-accent':     string
  '--color-bg':         string
  '--color-surface':    string
  '--color-text':       string
  '--color-text-muted': string
  '--color-border':     string
  '--color-secondary':  string
  '--color-focus':      string
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0, s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h}, ${s}%, ${l}%)`
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function deriveCustomThemeVars(primary: string, accent: string): ThemeVars {
  if (!HEX_RE.test(primary)) throw new TypeError(`Invalid primary hex: ${primary}`)
  if (!HEX_RE.test(accent))  throw new TypeError(`Invalid accent hex: ${accent}`)

  const [ph] = hexToHsl(primary)
  const [ah] = hexToHsl(accent)

  return {
    '--color-primary':    primary,
    '--color-accent':     accent,
    '--color-bg':         hsl(ph, 20, 85),
    '--color-surface':    hsl(ph, 15, 92),
    '--color-text':       hsl(ph, 40, 10),
    '--color-text-muted': hsl(ph, 25, 40),
    '--color-border':     hsl(ph, 22, 78),
    '--color-secondary':  hsl(ah, 35, 55),
    '--color-focus':      accent,
  }
}
