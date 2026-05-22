import { auth } from '@/lib/auth'
import { canAdminProject } from '@/lib/authorization'
import { prisma } from '@/lib/db'
import { periodRange, type Period } from '@/lib/activity-tracker-config'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { projectId } = await params

  if (!(await canAdminProject(session.user.id, session.user.role, projectId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
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

  const evaluators = await prisma.projectEvaluator.findMany({
    where: { projectId },
    select: { userId: true },
  })
  const userIds = evaluators.map((e) => e.userId)
  if (userIds.length === 0) {
    return NextResponse.json({
      period,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      annotators: [],
    })
  }

  const dailyRows = await prisma.activityDaily.findMany({
    where: {
      userId: { in: userIds },
      date: { gte: range.from, lt: range.to },
    },
    select: { userId: true, annotationSeconds: true, otherSeconds: true },
  })

  const totals = new Map<string, { annotationSeconds: number; otherSeconds: number }>()
  for (const uid of userIds) totals.set(uid, { annotationSeconds: 0, otherSeconds: 0 })
  for (const row of dailyRows) {
    const cur = totals.get(row.userId)
    if (!cur) continue
    cur.annotationSeconds += row.annotationSeconds
    cur.otherSeconds += row.otherSeconds
  }

  return NextResponse.json({
    period,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    annotators: userIds.map((userId) => ({
      userId,
      annotationSeconds: totals.get(userId)!.annotationSeconds,
      otherSeconds: totals.get(userId)!.otherSeconds,
    })),
  })
}
