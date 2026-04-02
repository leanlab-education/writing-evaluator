import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/projects/[projectId]/unbatched-stats
// Returns counts of unbatched items grouped by activityId × conjunctionId
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { projectId } = await params

  const groups = await prisma.feedbackItem.groupBy({
    by: ['activityId', 'conjunctionId'],
    where: { projectId, batchId: null },
    _count: { id: true },
    orderBy: [{ activityId: 'asc' }, { conjunctionId: 'asc' }],
  })

  const totalUnbatched = await prisma.feedbackItem.count({
    where: { projectId, batchId: null },
  })

  return NextResponse.json({
    totalUnbatched,
    groups: groups.map((g) => ({
      activityId: g.activityId,
      conjunctionId: g.conjunctionId,
      count: g._count.id,
    })),
  })
}
