import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { pullProductsFromSquare, pullInventoryFromSquare } from '@/lib/channels/square/catalog'

export async function POST() {
  const { error } = await requireAdminSession()
  if (error) return error

  try {
    const [catalog, stock] = await Promise.all([
      pullProductsFromSquare(),
      pullInventoryFromSquare(),
    ])
    return NextResponse.json({
      catalog: { upserted: catalog.upserted, errors: catalog.errors },
      stock: { updated: stock.updated, skipped: stock.skipped, errors: stock.errors },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
