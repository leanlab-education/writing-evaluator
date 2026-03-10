import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const evaluatorProjects = await prisma.projectEvaluator.findMany({
    where: { userId: session.user.id },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
        },
      },
      _count: {
        select: { assignments: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Get completed assignment counts
  const completedCounts = await prisma.assignment.groupBy({
    by: ['evaluatorId'],
    where: {
      evaluatorId: {
        in: evaluatorProjects.map((ep) => ep.id),
      },
      status: 'COMPLETE',
    },
    _count: { id: true },
  })

  const completedMap = new Map(
    completedCounts.map((c) => [c.evaluatorId, c._count.id])
  )

  const result = evaluatorProjects.map((ep) => ({
    id: ep.id,
    projectId: ep.projectId,
    project: ep.project,
    assignmentCount: ep._count.assignments,
    completedCount: completedMap.get(ep.id) || 0,
  }))

  return NextResponse.json(result)
}
