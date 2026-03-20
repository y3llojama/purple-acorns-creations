'use client'

const CATEGORIES = ['All', 'rings', 'necklaces', 'earrings', 'bracelets', 'crochet', 'other'] as const

interface Props { active: string; onChange: (cat: string) => void }

export default function CategoryFilter({ active, onChange }: Props) {
  return (
    <div role="group" aria-label="Filter by category" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '24px' }}>
      {CATEGORIES.map(cat => (
        <button
          key={cat}
          onClick={() => onChange(cat === 'All' ? '' : cat)}
          aria-pressed={active === (cat === 'All' ? '' : cat)}
          style={{
            padding: '8px 16px', border: '1px solid var(--color-border)', borderRadius: '20px',
            background: active === (cat === 'All' ? '' : cat) ? 'var(--color-primary)' : 'transparent',
            color: active === (cat === 'All' ? '' : cat) ? 'var(--color-accent)' : 'var(--color-primary)',
            cursor: 'pointer', fontSize: '14px', minHeight: '48px', textTransform: 'capitalize',
          }}
        >
          {cat}
        </button>
      ))}
    </div>
  )
}
