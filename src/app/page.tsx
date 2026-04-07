import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { EvaluatorDashboard } from '@/components/evaluator-dashboard'

export default async function HomePage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  // Admins go straight to the admin dashboard
  if (session.user.role === 'ADMIN') redirect('/admin')

  // Evaluator: fetch assigned projects server-side
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

  // Group batch assignments by projectId and count scored items
  const batchesByProject = new Map<
    string,
    { id: string; name: string; status: string; itemCount: number; scoredCount: number; discrepancyCount?: number; reconciledCount?: number }[]
  >()

  for (const ba of batchAssignments) {
    const pid = ba.batch.project.id
    if (!batchesByProject.has(pid)) batchesByProject.set(pid, [])

    const scoredCount = await prisma.feedbackItem.count({
      where: {
        batchId: ba.batch.id,
        scores: { some: { userId: session.user.id } },
      },
    })

    // For RECONCILING batches, compute discrepancy stats
    let discrepancyCount: number | undefined
    let reconciledCount: number | undefined
    if (ba.batch.status === 'RECONCILING') {
      // Count original scores grouped by (feedbackItemId, dimensionId) with 2 evaluators that disagree
      const originalScores = await prisma.score.findMany({
        where: { feedbackItem: { batchId: ba.batch.id }, isReconciled: false },
        select: { feedbackItemId: true, dimensionId: true, value: true },
      })
      const groups = new Map<string, number[]>()
      for (const s of originalScores) {
        const key = `${s.feedbackItemId}::${s.dimensionId}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(s.value)
      }
      discrepancyCount = 0
      for (const [, values] of groups) {
        if (values.length === 2 && values[0] !== values[1]) discrepancyCount++
      }
      reconciledCount = await prisma.score.count({
        where: { feedbackItem: { batchId: ba.batch.id }, isReconciled: true },
      })
    }

    batchesByProject.get(pid)!.push({
      id: ba.batch.id,
      name: ba.batch.name,
      status: ba.batch.status,
      itemCount: ba.batch._count.feedbackItems,
      scoredCount,
      discrepancyCount,
      reconciledCount,
    })
  }

  const projects = evaluatorProjects.map((ep) => ({
    id: ep.id,
    projectId: ep.projectId,
    project: ep.project,
    assignmentCount: ep._count.assignments,
    completedCount: completedMap.get(ep.id) || 0,
    batches: batchesByProject.get(ep.projectId) || [],
  }))

  return (
    <EvaluatorDashboard
      projects={projects}
      userName={session.user.name || session.user.email || 'Evaluator'}
    />
  )
}
