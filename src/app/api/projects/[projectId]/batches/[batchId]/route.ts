import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SCORING'],
  SCORING: ['RECONCILING', 'COMPLETE'],
  RECONCILING: ['COMPLETE', 'SCORING'],
  COMPLETE: ['SCORING'],
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; batchId: string }> }
) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { projectId, batchId } = await params
  const body = await request.json()
  const { status } = body as { status?: string }

  if (!status) {
    return NextResponse.json(
      { error: 'status is required' },
      { status: 400 }
    )
  }

  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { status: true, projectId: true },
  })

  if (!batch || batch.projectId !== projectId) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  }

  const allowed = VALID_TRANSITIONS[batch.status]
  if (!allowed || !allowed.includes(status)) {
    return NextResponse.json(
      {
        error: `Cannot transition from ${batch.status} to ${status}. Allowed: ${allowed?.join(', ') || 'none'}`,
      },
      { status: 400 }
    )
  }

  const updated = await prisma.batch.update({
    where: { id: batchId },
    data: { status: status as 'DRAFT' | 'SCORING' | 'RECONCILING' | 'COMPLETE' },
  })

  // When transitioning to RECONCILING, auto-reconcile dimensions where both
  // evaluators already agree. This keeps the reconciliation UI focused on
  // actual disagreements and ensures a complete reconciled dataset for export.
  if (batch.status === 'SCORING' && status === 'RECONCILING') {
    await autoReconcileAgreedScores(batchId)
  }

  return NextResponse.json(updated)
}

/**
 * For each (feedbackItemId, dimensionId) pair in the batch where two evaluators
 * scored the same value, create a reconciled Score record automatically.
 */
async function autoReconcileAgreedScores(batchId: string) {
  // Get the PRIMARY evaluator's userId (used as the owner of auto-reconciled scores)
  const primaryAssignment = await prisma.batchAssignment.findFirst({
    where: { batchId, scoringRole: 'PRIMARY' },
    select: { userId: true },
  })
  if (!primaryAssignment) return

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

  // Group by (feedbackItemId, dimensionId)
  const groups = new Map<string, typeof scores>()
  for (const score of scores) {
    const key = `${score.feedbackItemId}::${score.dimensionId}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(score)
  }

  // Find pairs that agree and create reconciled scores
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

    // Both evaluators agree - auto-reconcile
    toCreate.push({
      feedbackItemId: group[0].feedbackItemId,
      userId: primaryAssignment.userId,
      dimensionId: group[0].dimensionId,
      value: group[0].value,
      isReconciled: true,
      reconciledFrom: `${group[0].id},${group[1].id}`,
      notes: 'Auto-reconciled (scores matched)',
    })
  }

  // Batch create in chunks to avoid oversized transactions
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
