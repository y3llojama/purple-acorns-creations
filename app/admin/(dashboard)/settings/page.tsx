import { getSettings } from '@/lib/theme'
import ShippingEditor from '@/components/admin/ShippingEditor'

export const metadata = { title: 'Admin — Settings' }

export default async function SettingsPage() {
  const settings = await getSettings()
  return (
    <ShippingEditor
      initialDomestic={{ mode: settings.shipping_mode ?? 'fixed', value: String(settings.shipping_value ?? 0) }}
      initialCanadaMexico={{ mode: settings.shipping_mode_canada_mexico ?? 'fixed', value: String(settings.shipping_value_canada_mexico ?? 0) }}
      initialIntl={{ mode: settings.shipping_mode_intl ?? 'fixed', value: String(settings.shipping_value_intl ?? 0) }}
    />
  )
}
