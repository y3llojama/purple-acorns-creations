'use client'

import { createContext, useContext, useState, useCallback } from 'react'

interface ToastState {
  message: string
  id: number
}

interface ToastContextValue {
  toast: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastState[]>([])

  const toast = useCallback((message: string) => {
    const id = Date.now()
    setToasts(prev => [...prev, { message, id }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          role="status"
          style={{
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            pointerEvents: 'none',
          }}
        >
          {toasts.map(t => (
            <div
              key={t.id}
              style={{
                background: 'var(--color-text)',
                color: 'var(--color-surface)',
                padding: '10px 20px',
                borderRadius: '6px',
                fontSize: '13px',
                fontFamily: "'Jost', sans-serif",
                fontWeight: 500,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                whiteSpace: 'nowrap',
              }}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
