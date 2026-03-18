interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger'
  children: React.ReactNode
}

export default function Button({ variant = 'primary', children, style, ...props }: ButtonProps) {
  const variantStyles: Record<string, React.CSSProperties> = {
    primary: { background: 'var(--color-primary)', color: 'var(--color-accent)', border: 'none' },
    secondary: { background: 'transparent', color: 'var(--color-primary)', border: '2px solid var(--color-primary)' },
    danger: { background: '#c05050', color: '#fff', border: 'none' },
  }
  return (
    <button {...props} style={{ ...variantStyles[variant], padding: '12px 24px', fontSize: '18px', borderRadius: '4px', cursor: 'pointer', minHeight: '48px', fontFamily: 'var(--font-body)', ...style }}>
      {children}
    </button>
  )
}
