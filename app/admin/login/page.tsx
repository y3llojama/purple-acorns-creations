'use client'
import { createClient } from '@/lib/supabase/client'

export default function AdminLoginPage() {
  async function signInWithGoogle() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/api/auth/callback` },
    })
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
      <button
        onClick={signInWithGoogle}
        style={{ background: 'var(--color-primary)', color: 'var(--color-accent)', border: 'none', padding: '16px 32px', fontSize: '18px', borderRadius: '4px', cursor: 'pointer', minHeight: '48px' }}
        aria-label="Sign in with your authorized Google account"
      >
        Sign in with Google
      </button>
    </main>
  )
}
