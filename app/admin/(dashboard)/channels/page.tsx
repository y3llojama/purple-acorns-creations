import { requireAdminSession } from '@/lib/auth'
import ChannelsManager from '@/components/admin/ChannelsManager'
import { redirect } from 'next/navigation'

export const metadata = { title: 'Channels' }

export default async function ChannelsPage() {
  const { error } = await requireAdminSession()
  if (error) redirect('/admin/login')
  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: 'var(--color-primary)', marginBottom: '32px' }}>Channels</h1>
      <ChannelsManager />
    </div>
  )
}
