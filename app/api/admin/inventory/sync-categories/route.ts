import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { ensureSquareCategories } from '@/lib/channels/square/catalog'
import { getChannelConfig } from '@/lib/channels'

export async function POST() {
  const { error } = await requireAdminSession()
  if (error) return error

  const { squareEnabled } = await getChannelConfig()
  if (!squareEnabled) {
    return NextResponse.json({ error: 'Square sync is not enabled' }, { status: 400 })
  }

  try {
    const categoryIds = await ensureSquareCategories()
    return NextResponse.json({ categoryIds })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
