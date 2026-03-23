import { requireAdminSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import PrivateSaleForm from '@/components/admin/PrivateSaleForm'

export default async function NewPrivateSalePage() {
  const { error } = await requireAdminSession()
  if (error) redirect('/admin/login')

  return (
    <div>
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--color-primary)', marginBottom: '24px' }}>
        Create Private Sale Link
      </h1>
      <PrivateSaleForm />
    </div>
  )
}
