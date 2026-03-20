import { NextResponse } from 'next/server'
import { syncAllProducts } from '@/lib/channels'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const results = await syncAllProducts()
  return NextResponse.json({ synced: results.length, errors: results.filter(r => !r.success).length })
}
