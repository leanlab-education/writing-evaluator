import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { EvaluatorDashboard } from '@/components/evaluator-dashboard'
import { countForAssignment, loadSlotMaps } from '@/lib/evaluator-stats'
import { getAdminProjectIds } from '@/lib/authorization'

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
          usePseudonyms: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Get batch assignments for this user
  const batchAssignments = await prisma.batchAssignment.findMany({
    where: {
      userId: session.user.id,
      OR: [{ teamReleaseId: null }, { teamRelease: { isVisible: true } }],
      batch: { isHidden: false },
    },
    include: {
      teamRelease: {
        include: {
          team: {
            include: {
              members: {
                select: { userId: true },
                orderBy: { user: { email: 'asc' } },
              },
              dimensions: {
                select: { dimensionId: true },
              },
            },
          },
        },
      },
      batch: {
        include: {
          _count: { select: { feedbackItems: true } },
          project: { select: { id: true } },
          teamReleases: {
            select: { status: true },
          },
        },
      },
    },
  })

  const { itemCountByBatchSlot, scoredCountByBatchSlot } = await loadSlotMaps(
    batchAssignments.map((ba) => ba.batch.id),
    session.user.id
  )

  // Group batch assignments by projectId and count scored items
  const batchesByProject = new Map<
    string,
    {
      id: string
      releaseId: string | null
      name: string
      status: string
      itemCount: number
      scoredCount: number
      discrepancyCount?: number
      reconciledCount?: number
    }[]
  >()

  for (const ba of batchAssignments) {
    const pid = ba.batch.project.id
    if (!batchesByProject.has(pid)) batchesByProject.set(pid, [])

    // For slot-split (non-double-scored regular) batches, countForAssignment
    // returns just this user's slot. Otherwise it returns the full batch total.
    const itemCount = countForAssignment(ba, session.user.id, itemCountByBatchSlot)
    const scoredCount = scoredCountByBatchSlot
      ? countForAssignment(ba, session.user.id, scoredCountByBatchSlot)
      : 0

    const releaseStatus = ba.teamRelease?.status ?? ba.batch.status
    const releaseId = ba.teamReleaseId ?? null

    let discrepancyCount: number | undefined
    let reconciledCount: number | undefined
    if (ba.teamRelease && releaseStatus === 'RECONCILING') {
      const dimensionIds =
        ba.batch.type === 'TRAINING'
          ? (
              await prisma.rubricDimension.findMany({
                where: { projectId: ba.batch.project.id },
                select: { id: true },
              })
            ).map((dimension) => dimension.id)
          : ba.teamRelease.team.dimensions.map((dimension) => dimension.dimensionId)
      const userIds = ba.teamRelease.team.members.map((member) => member.userId)
      const ownerUserId = ba.teamRelease.team.members[0]?.userId

      const originalScores = await prisma.score.findMany({
        where: {
          feedbackItem: { batchId: ba.batch.id },
          userId: { in: userIds },
          dimensionId: { in: dimensionIds },
          isReconciled: false,
        },
        select: { feedbackItemId: true, dimensionId: true, value: true, userId: true },
      })
      const groups = new Map<string, { value: number; userId: string }[]>()
      for (const s of originalScores) {
        const key = `${s.feedbackItemId}::${s.dimensionId}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push({ value: s.value, userId: s.userId })
      }
      discrepancyCount = 0
      const discrepantKeys = new Set<string>()
      for (const [key, values] of groups) {
        if (
          values.length === 2 &&
          values[0].userId !== values[1].userId &&
          values[0].value !== values[1].value
        ) {
          discrepancyCount++
          discrepantKeys.add(key)
        }
      }
      if (ownerUserId) {
        // Only count reconciled scores that resolved an actual discrepancy.
        // Auto-reconciled agreed pairs also have isReconciled=true but they
        // weren't disagreements, so they shouldn't count toward the "X / Y
        // reconciled" progress display.
        const reconciledScores = await prisma.score.findMany({
          where: {
            feedbackItem: { batchId: ba.batch.id },
            userId: ownerUserId,
            dimensionId: { in: dimensionIds },
            isReconciled: true,
          },
          select: { feedbackItemId: true, dimensionId: true },
        })
        reconciledCount = reconciledScores.filter((r) =>
          discrepantKeys.has(`${r.feedbackItemId}::${r.dimensionId}`)
        ).length
      }
    }

    batchesByProject.get(pid)!.push({
      id: ba.batch.id,
      releaseId,
      name: ba.batch.name,
      status: releaseStatus,
      itemCount,
      scoredCount,
      discrepancyCount,
      reconciledCount,
    })
  }

  const adminProjectIdList = await getAdminProjectIds(session.user.id)
  const adminProjectIdSet = new Set(adminProjectIdList)

  const projects = evaluatorProjects.map((ep) => {
    const batches = batchesByProject.get(ep.projectId) || []
    const assignmentCount = batches.reduce((sum, b) => sum + b.itemCount, 0)
    const completedCount = batches.reduce((sum, b) => sum + b.scoredCount, 0)
    return {
      id: ep.id,
      projectId: ep.projectId,
      project: ep.project,
      assignmentCount,
      completedCount,
      batches,
      isProjectAdmin: adminProjectIdSet.has(ep.projectId),
    }
  })

  return (
    <EvaluatorDashboard
      projects={projects}
      userName={session.user.name || session.user.email || 'Annotator'}
      hasAdminProjects={adminProjectIdList.length > 0}
    />
  )
}
