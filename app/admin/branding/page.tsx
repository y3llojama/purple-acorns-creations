import { getSettings } from '@/lib/theme'
import BrandingEditor from '@/components/admin/BrandingEditor'

export const metadata = { title: 'Admin — Branding' }

export default async function BrandingAdminPage() {
  const settings = await getSettings()
  return <BrandingEditor settings={settings} />
}
