import { prisma } from '@/lib/db'
import { isBatchFullyScored } from '@/lib/batch-progress'

/**
 * For each (feedbackItemId, dimensionId) pair in the batch where two
 * evaluators scored the same value, create a reconciled Score record
 * automatically. Called when a batch transitions SCORING → RECONCILING so
 * the reconcile UI only surfaces actual disagreements.
 *
 * The auto-reconciled Score rows are owned by the batch's first assigned
 * evaluator (by assignment creation order) — a role-free convention.
 */
export async function autoReconcileAgreedScores(batchId: string) {
  const firstAssignment = await prisma.batchAssignment.findFirst({
    where: { batchId },
    orderBy: { createdAt: 'asc' },
    select: { userId: true },
  })
  if (!firstAssignment) return

  const scores = await prisma.score.findMany({
    where: {
      feedbackItem: { batchId },
      isReconciled: false,
    },
    select: {
      id: true,
      feedbackItemId: true,
      userId: true,
      dimensionId: true,
      value: true,
    },
  })

  const groups = new Map<string, typeof scores>()
  for (const score of scores) {
    const key = `${score.feedbackItemId}::${score.dimensionId}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(score)
  }

  const toCreate: {
    feedbackItemId: string
    userId: string
    dimensionId: string
    value: number
    isReconciled: boolean
    reconciledFrom: string
    notes: string
  }[] = []

  for (const [, group] of groups) {
    if (group.length !== 2) continue
    if (group[0].value !== group[1].value) continue
    toCreate.push({
      feedbackItemId: group[0].feedbackItemId,
      userId: firstAssignment.userId,
      dimensionId: group[0].dimensionId,
      value: group[0].value,
      isReconciled: true,
      reconciledFrom: `${group[0].id},${group[1].id}`,
      notes: 'Auto-reconciled (scores matched)',
    })
  }

  const CHUNK_SIZE = 100
  for (let i = 0; i < toCreate.length; i += CHUNK_SIZE) {
    const chunk = toCreate.slice(i, i + CHUNK_SIZE)
    await prisma.$transaction(
      chunk.map((data) =>
        prisma.score.upsert({
          where: {
            feedbackItemId_userId_dimensionId_isReconciled: {
              feedbackItemId: data.feedbackItemId,
              userId: data.userId,
              dimensionId: data.dimensionId,
              isReconciled: true,
            },
          },
          update: {
            value: data.value,
            reconciledFrom: data.reconciledFrom,
            notes: data.notes,
          },
          create: data,
        })
      )
    )
  }
}

/**
 * After a score is saved, check whether the batch is now fully scored by
 * every assigned evaluator. If so, auto-transition SCORING → RECONCILING
 * and run auto-reconciliation on agreed dimensions.
 *
 * Per Amber's 2026-04-09 meeting answer: "I think it auto-triggering would
 * be great. I don't see any advantages to having one of us review before
 * manually releasing reconciliation view."
 *
 * Only triggers when:
 *  - Batch is in SCORING status
 *  - Batch has 2+ assigned evaluators (single-scorer batches never need it)
 *  - Every evaluator has finished every expected (item × dimension)
 */
export async function maybeAutoTransitionToReconciling(
  batchId: string
): Promise<boolean> {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: {
      status: true,
      assignments: {
        select: {
          userId: true,
          teamRelease: {
            select: { isVisible: true },
          },
        },
      },
      teamReleases: {
        select: { isVisible: true },
      },
    },
  })
  if (!batch) return false
  if (batch.status !== 'SCORING') return false
  if (batch.teamReleases.some((release) => !release.isVisible)) return false

  const visibleAssignments = batch.assignments.filter(
    (assignment) => assignment.teamRelease?.isVisible ?? true
  )
  if (visibleAssignments.length < 2) return false

  const done = await isBatchFullyScored(batchId)
  if (!done) return false

  await prisma.batch.update({
    where: { id: batchId },
    data: { status: 'RECONCILING' },
  })
  await autoReconcileAgreedScores(batchId)
  return true
}
