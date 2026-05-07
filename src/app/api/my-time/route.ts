import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { periodRange, type Period } from '@/lib/activity-tracker-config'
import { NextRequest, NextResponse } from 'next/server'

// Returns the *current user's* aggregated activity time for a period.
// Used by the (currently hidden) self-view on the evaluator dashboard.
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  const { searchParams } = new URL(request.url)
  const periodParam = searchParams.get('period') ?? 'month'
  if (
    periodParam !== 'week' &&
    periodParam !== 'month' &&
    periodParam !== 'all' &&
    periodParam !== 'custom'
  ) {
    return NextResponse.json({ error: 'Invalid period' }, { status: 400 })
  }
  const period = periodParam as Period

  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')

  let range
  try {
    range = periodRange(period, {
      from: fromParam ? new Date(fromParam) : undefined,
      to: toParam ? new Date(toParam) : undefined,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Invalid range' },
      { status: 400 }
    )
  }

  const dailyRows = await prisma.activityDaily.findMany({
    where: { userId, date: { gte: range.from, lt: range.to } },
    select: { annotationSeconds: true, otherSeconds: true },
  })

  let annotationSeconds = 0
  let otherSeconds = 0
  for (const row of dailyRows) {
    annotationSeconds += row.annotationSeconds
    otherSeconds += row.otherSeconds
  }

  return NextResponse.json({
    period,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    annotationSeconds,
    otherSeconds,
  })
}
