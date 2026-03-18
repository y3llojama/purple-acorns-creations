interface FormFieldProps { label: string; id: string; error?: string; required?: boolean; children: React.ReactNode }

export default function FormField({ label, id, error, required, children }: FormFieldProps) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <label htmlFor={id} style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '18px' }}>
        {label}{required && <span aria-hidden="true" style={{ color: '#c05050' }}> *</span>}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" aria-live="polite" style={{ color: '#c05050', marginTop: '4px', fontSize: '16px' }}>
          {error}
        </p>
      )}
    </div>
  )
}
