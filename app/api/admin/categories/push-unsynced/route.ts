import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { pushCategory } from '@/lib/channels/square/catalog'

export async function POST() {
  const { error } = await requireAdminSession()
  if (error) return error

  const supabase = createServiceRoleClient()
  const { data: categories, error: fetchError } = await supabase
    .from('categories')
    .select('*')
    .is('square_category_id', null)

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!categories?.length) return NextResponse.json({ pushed: 0, errors: [] })

  // Only push leaf categories — those with no children (structural, not type-based)
  const parentIds = new Set((categories ?? []).filter((c: { parent_id: string | null }) => c.parent_id !== null).map((c: { parent_id: string | null }) => c.parent_id))
  const leafCategories = (categories ?? []).filter((c: { id: string }) => !parentIds.has(c.id))
  if (!leafCategories.length) return NextResponse.json({ pushed: 0, errors: [] })

  let pushed = 0
  const errors: string[] = []

  for (const category of leafCategories) {
    const result = await pushCategory(category)
    if (result.success) {
      pushed++
    } else {
      errors.push(`${category.name}: ${result.error}`)
    }
  }

  return NextResponse.json({ pushed, errors })
}
