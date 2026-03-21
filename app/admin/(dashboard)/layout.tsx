import AdminSidebar from '@/components/admin/AdminSidebar'
import { getSettings } from '@/lib/theme'
import styles from './layout.module.css'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSettings()
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--color-bg)' }}>
      <AdminSidebar businessName={settings.business_name} />
      <main className={styles.main}>
        {children}
      </main>
    </div>
  )
}
