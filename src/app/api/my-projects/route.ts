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

  // Get batch assignments for this user
  const batchAssignments = await prisma.batchAssignment.findMany({
    where: { userId: session.user.id },
    include: {
      batch: {
        include: {
          _count: { select: { feedbackItems: true } },
          project: { select: { id: true } },
        },
      },
    },
  })

  // Group batch assignments by projectId
  const batchesByProject = new Map<
    string,
    { id: string; name: string; itemCount: number; scoredCount: number }[]
  >()

  for (const ba of batchAssignments) {
    const pid = ba.batch.project.id
    if (!batchesByProject.has(pid)) batchesByProject.set(pid, [])

    // Count items scored by this user in this batch
    const scoredCount = await prisma.feedbackItem.count({
      where: {
        batchId: ba.batch.id,
        scores: {
          some: { userId: session.user.id },
        },
      },
    })

    batchesByProject.get(pid)!.push({
      id: ba.batch.id,
      name: ba.batch.name,
      itemCount: ba.batch._count.feedbackItems,
      scoredCount,
    })
  }

  const result = evaluatorProjects.map((ep) => {
    const batches = batchesByProject.get(ep.projectId) || []
    // In batch mode, derive totals from batch sums; fall back to Assignment table
    const assignmentCount =
      batches.length > 0
        ? batches.reduce((sum, b) => sum + b.itemCount, 0)
        : ep._count.assignments
    const completedCount =
      batches.length > 0
        ? batches.reduce((sum, b) => sum + b.scoredCount, 0)
        : completedMap.get(ep.id) || 0
    return {
      id: ep.id,
      projectId: ep.projectId,
      project: ep.project,
      assignmentCount,
      completedCount,
      batches,
    }
  })

  return NextResponse.json(result)
}
