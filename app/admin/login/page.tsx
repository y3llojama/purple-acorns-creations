'use client'
import { createClient } from '@/lib/supabase/client'
import { useSearchParams } from 'next/navigation'

export default function AdminLoginPage() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  async function signInWithGoogle() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    })
  }

  const errorMessages: Record<string, string> = {
    unauthorized: 'This Google account is not authorized. Please use an authorized account.',
    auth_failed: 'Sign-in failed. Please try again.',
    no_code: 'Authentication error. Please try again.',
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
      <div style={{ textAlign: 'center', padding: '48px', maxWidth: '400px', width: '90%' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', marginBottom: '8px', color: 'var(--color-primary)' }}>
          Purple Acorns Admin
        </h1>
        <p style={{ color: 'var(--color-text-muted)', marginBottom: '32px', fontSize: '18px' }}>
          Sign in to manage your site
        </p>
        {error && errorMessages[error] && (
          <p role="alert" style={{ color: '#c05050', marginBottom: '24px', fontSize: '16px', padding: '12px', background: '#fff0f0', borderRadius: '4px' }}>
            {errorMessages[error]}
          </p>
        )}
        <button
          onClick={signInWithGoogle}
          style={{ background: 'var(--color-primary)', color: 'var(--color-accent)', border: 'none', padding: '16px 32px', fontSize: '18px', borderRadius: '4px', cursor: 'pointer', width: '100%', minHeight: '48px' }}
          aria-label="Sign in with your authorized Google account"
        >
          Sign in with Google
        </button>
      </div>
    </main>
  )
}
