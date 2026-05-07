import { sweepStaleSessions } from '@/lib/activity-tracker'
import { NextRequest, NextResponse } from 'next/server'

// Vercel cron pings this route every 5 min in production. Locally it can be
// invoked manually.
//
// In production we require a Bearer match against CRON_SECRET. In dev (no
// CRON_SECRET set) the route is open — sweep is idempotent.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const isProd = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production'

  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } else if (isProd) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const result = await sweepStaleSessions()
  return NextResponse.json(result)
}
