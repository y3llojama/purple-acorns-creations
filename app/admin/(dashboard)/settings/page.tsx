import { getSettings } from '@/lib/theme'
import ShippingEditor from '@/components/admin/ShippingEditor'

export const metadata = { title: 'Admin — Settings' }

export default async function SettingsPage() {
  const settings = await getSettings()
  return (
    <ShippingEditor
      initialShippingMode={settings.shipping_mode ?? 'fixed'}
      initialShippingValue={String(settings.shipping_value ?? 0)}
    />
  )
}
