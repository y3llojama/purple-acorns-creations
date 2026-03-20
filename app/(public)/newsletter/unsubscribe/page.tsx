import { Suspense } from 'react'
import UnsubscribeForm from './UnsubscribeForm'

export const metadata = { title: 'Unsubscribe — Purple Acorns Creations' }

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<div style={{ padding: '48px', textAlign: 'center' }}>Loading...</div>}>
      <UnsubscribeForm />
    </Suspense>
  )
}
