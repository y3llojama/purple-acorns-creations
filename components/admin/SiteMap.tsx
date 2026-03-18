type SiteZone =
  | 'announcement' | 'header' | 'hero' | 'story' | 'our-story'
  | 'products' | 'gallery' | 'event' | 'instagram' | 'newsletter' | 'footer'

type Hint = 'bar' | 'text' | 'image' | 'cards' | 'grid' | 'input'

interface ZoneDef { zone: SiteZone; flex: number; hint: Hint }

export interface SiteMapProps {
  highlight: SiteZone
  label: string
  description: string
}

const HOMEPAGE_ZONES: ZoneDef[] = [
  { zone: 'announcement', flex: 4,  hint: 'bar'   },
  { zone: 'header',       flex: 8,  hint: 'bar'   },
  { zone: 'hero',         flex: 22, hint: 'image' },
  { zone: 'story',        flex: 12, hint: 'text'  },
  { zone: 'products',     flex: 14, hint: 'cards' },
  { zone: 'gallery',      flex: 10, hint: 'grid'  },
  { zone: 'event',        flex: 8,  hint: 'text'  },
  { zone: 'instagram',    flex: 10, hint: 'grid'  },
  { zone: 'newsletter',   flex: 8,  hint: 'input' },
  { zone: 'footer',       flex: 4,  hint: 'bar'   },
]

const OUR_STORY_ZONES: ZoneDef[] = [
  { zone: 'header',    flex: 10, hint: 'bar'  },
  { zone: 'our-story', flex: 90, hint: 'text' },
]

function ZoneHint({ hint }: { hint: Hint }) {
  switch (hint) {
    case 'text':
      return (
        <div style={{
          width: '80%', margin: '4px auto',
          background: 'repeating-linear-gradient(transparent 0px, transparent 3px, #ccc 3px, #ccc 4px, transparent 4px, transparent 8px)',
          minHeight: '12px', flex: 1,
        }} />
      )
    case 'image':
      return <div style={{ width: '60%', height: '60%', margin: 'auto', background: '#d0d0d0', borderRadius: '2px' }} />
    case 'cards':
      return (
        <div style={{ display: 'flex', gap: '3px', padding: '4px', width: '100%', alignItems: 'center' }}>
          {[0, 1, 2].map(i => <div key={i} style={{ flex: 1, height: '16px', background: '#d0d0d0', borderRadius: '2px' }} />)}
        </div>
      )
    case 'grid':
      return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2px', padding: '4px', width: '100%' }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ aspectRatio: '1', background: '#d0d0d0', borderRadius: '1px' }} />
          ))}
        </div>
      )
    case 'input':
      return (
        <div style={{ padding: '4px', display: 'flex', gap: '3px', alignItems: 'center', width: '100%' }}>
          <div style={{ flex: 1, height: '8px', background: '#d0d0d0', borderRadius: '2px' }} />
          <div style={{ width: '20px', height: '8px', background: '#b0b0b0', borderRadius: '2px' }} />
        </div>
      )
    default: // 'bar'
      return <div style={{ width: '70%', height: '4px', margin: '4px auto', background: '#d0d0d0', borderRadius: '2px' }} />
  }
}

export default function SiteMap({ highlight, label, description }: SiteMapProps) {
  const zones = highlight === 'our-story' ? OUR_STORY_ZONES : HOMEPAGE_ZONES

  return (
    <div style={{ marginBottom: '24px' }}>
      <div
        data-testid="sitemap-wireframe"
        style={{
          width: '120px',
          height: '200px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          display: 'flex',
          flexDirection: 'column',
          background: '#fafafa',
        }}
      >
        {zones.map(({ zone, flex, hint }) => {
          const isHighlighted = zone === highlight
          return (
            <div
              key={zone}
              data-testid={`sitemap-zone-${zone}`}
              style={{
                flex: `0 0 ${flex}%`,
                position: 'relative',
                overflow: 'visible',
                background: isHighlighted
                  ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)'
                  : '#f0f0f0',
                borderLeft: isHighlighted ? '3px solid var(--color-primary)' : '3px solid transparent',
                boxShadow: isHighlighted
                  ? '0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent)'
                  : 'none',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {isHighlighted ? (
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: '-10px',
                    left: '4px',
                    background: 'var(--color-primary)',
                    color: '#fff',
                    fontSize: '11px',
                    fontFamily: 'sans-serif',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    whiteSpace: 'nowrap',
                    zIndex: 1,
                  }}
                >
                  {label}
                </div>
              ) : (
                <ZoneHint hint={hint} />
              )}
            </div>
          )
        })}
      </div>
      <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-text-muted)', maxWidth: '280px', lineHeight: 1.5 }}>
        {description}
      </p>
    </div>
  )
}
