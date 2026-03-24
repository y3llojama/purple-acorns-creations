import AdminSidebar from '@/components/admin/AdminSidebar'
import { getSettings } from '@/lib/theme'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { UnreadCountProvider } from '@/lib/contexts/unread-count-context'
import styles from './layout.module.css'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServiceRoleClient()
  const [settings, { count }] = await Promise.all([
    getSettings(),
    supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false),
  ])

  return (
    <UnreadCountProvider initialCount={count ?? 0}>
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
        <AdminSidebar businessName={settings.business_name} />
        <main className={styles.main}>
          {children}
        </main>
      </div>
    </UnreadCountProvider>
  )
}
