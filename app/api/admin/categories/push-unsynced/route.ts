import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { pushCategory } from '@/lib/channels/square/catalog'

export async function POST() {
  const { error } = await requireAdminSession()
  if (error) return error

  const supabase = createServiceRoleClient()

  // Fetch ALL categories so we can determine hierarchy correctly
  const { data: allCategories, error: fetchError } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true })

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!allCategories?.length) return NextResponse.json({ pushed: 0, errors: [] })

  const unsynced = allCategories.filter((c: { square_category_id: string | null }) => !c.square_category_id)
  if (!unsynced.length) return NextResponse.json({ pushed: 0, errors: [] })

  // Push in two phases: parents first so children can reference their Square IDs
  const unsyncedParents = unsynced.filter((c: { parent_id: string | null }) => !c.parent_id)
  const unsyncedChildren = unsynced.filter((c: { parent_id: string | null }) => !!c.parent_id)

  let pushed = 0
  const errors: string[] = []

  for (const category of [...unsyncedParents, ...unsyncedChildren]) {
    // Re-fetch the category so parent's square_category_id is current after phase 1
    const { data: fresh } = await supabase.from('categories').select('*').eq('id', category.id).single()
    const result = await pushCategory(fresh ?? category)
    if (result.success) {
      pushed++
    } else {
      errors.push(`${category.name}: ${result.error}`)
    }
  }

  return NextResponse.json({ pushed, errors })
}
