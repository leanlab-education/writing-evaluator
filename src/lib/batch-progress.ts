import { prisma } from '@/lib/db'

/**
 * Determines whether every assigned evaluator has finished scoring every
 * (item × dimension) they are expected to score in a batch.
 *
 * "Expected dimensions" varies by evaluator and batch type:
 * - TRAINING batch → every evaluator scores every project dimension
 * - REGULAR batch, evaluator on a team → evaluator scores their team's dimensions
 * - REGULAR batch, evaluator not on a team → evaluator scores every project dimension
 *
 * Used for:
 * - Auto-transitioning SCORING → RECONCILING when both coders finish
 *   (per Amber's 2026-04-09 meeting note: auto-trigger is preferred)
 * - IRR calculation (can't compute IRR until both coders have finished)
 */
export async function isBatchFullyScored(batchId: string): Promise<boolean> {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: {
      projectId: true,
      type: true,
      feedbackItems: { select: { id: true } },
      assignments: {
        select: {
          userId: true,
          teamRelease: {
            select: { isVisible: true },
          },
        },
      },
      teamReleases: {
        select: {
          isVisible: true,
        },
      },
    },
  })
  if (!batch) return false
  if (batch.feedbackItems.length === 0) return false

  if (
    batch.type === 'REGULAR' &&
    batch.teamReleases.some((release) => !release.isVisible)
  ) {
    return false
  }

  const activeAssignments =
    batch.type === 'TRAINING'
      ? batch.assignments
      : batch.assignments.filter((assignment) => assignment.teamRelease?.isVisible)

  if (activeAssignments.length === 0) return false

  const itemIds = batch.feedbackItems.map((f) => f.id)
  const allDimensions = await prisma.rubricDimension.findMany({
    where: { projectId: batch.projectId },
    select: { id: true },
  })
  const allDimIds = allDimensions.map((d) => d.id)
  if (allDimIds.length === 0) return false

  // Team memberships for this project — reused across evaluators
  const teamMemberships = await prisma.evaluatorTeamMember.findMany({
    where: {
      userId: { in: activeAssignments.map((a) => a.userId) },
      team: { projectId: batch.projectId },
    },
    include: {
      team: { include: { dimensions: { select: { dimensionId: true } } } },
    },
  })
  const teamDimsByUser = new Map<string, string[]>()
  for (const tm of teamMemberships) {
    teamDimsByUser.set(
      tm.userId,
      tm.team.dimensions.map((d) => d.dimensionId)
    )
  }

  for (const { userId } of activeAssignments) {
    const expectedDimIds =
      batch.type === 'TRAINING'
        ? allDimIds
        : teamDimsByUser.get(userId) || allDimIds

    const expectedCount = itemIds.length * expectedDimIds.length

    const actualCount = await prisma.score.count({
      where: {
        userId,
        feedbackItemId: { in: itemIds },
        dimensionId: { in: expectedDimIds },
        isReconciled: false,
      },
    })
    if (actualCount < expectedCount) return false
  }

  return true
}
