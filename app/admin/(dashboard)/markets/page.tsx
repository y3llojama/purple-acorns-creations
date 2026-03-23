import { createServiceRoleClient } from '@/lib/supabase/server'
import MarketsManager from '@/components/admin/MarketsManager'
import { DiscoveryProvider } from '@/components/admin/DiscoveryProvider'
import DiscoveryBanner from '@/components/admin/DiscoveryBanner'
import type { CraftFair, ArtistVenue } from '@/lib/supabase/types'

export const metadata = { title: 'Admin — Markets' }

export default async function MarketsAdminPage() {
  const supabase = createServiceRoleClient()
  const [{ data: craft_fairs }, { data: artist_venues }] = await Promise.all([
    supabase.from('craft_fairs').select('*').order('name'),
    supabase.from('artist_venues').select('*').order('name'),
  ])
  return (
    <DiscoveryProvider
      endpoint="/api/admin/markets/discover"
      pollEndpoint="/api/admin/markets/fairs"
      noun="market"
    >
      <DiscoveryBanner searchingMessage="Searching for markets in the background — you can keep using the admin while this runs." />
      <MarketsManager
        initialFairs={(craft_fairs ?? []) as CraftFair[]}
        initialVenues={(artist_venues ?? []) as ArtistVenue[]}
      />
    </DiscoveryProvider>
  )
}
