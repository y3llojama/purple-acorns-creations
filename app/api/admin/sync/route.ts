import { NextResponse } from 'next/server'
import { requireAdminSession } from '@/lib/auth'
import { syncAllProducts } from '@/lib/channels'

export async function POST(request: Request) {
  const { error } = await requireAdminSession()
  if (error) return error
  const results = await syncAllProducts()
  return NextResponse.json({ synced: results.length, errors: results.filter(r => !r.success).length, details: results })
}
