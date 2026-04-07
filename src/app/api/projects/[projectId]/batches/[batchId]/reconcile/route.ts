import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/projects/[projectId]/batches/[batchId]/reconcile
// Accepts reconciled (final) scores for discrepant dimensions.
// One evaluator submits on behalf of both partners.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; batchId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { projectId, batchId } = await params

  // Must be an evaluator assigned to this batch
  const assignment = await prisma.batchAssignment.findUnique({
    where: { batchId_userId: { batchId, userId: session.user.id } },
  })
  if (!assignment) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { status: true, projectId: true },
  })

  if (!batch || batch.projectId !== projectId) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  }

  if (batch.status !== 'RECONCILING') {
    return NextResponse.json(
      { error: 'Batch must be in RECONCILING status' },
      { status: 400 }
    )
  }

  const body = await request.json()
  const { items } = body as {
    items: {
      feedbackItemId: string
      scores: { dimensionId: string; value: number }[]
      notes?: string
    }[]
  }

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: 'items array is required' },
      { status: 400 }
    )
  }

  // Load rubric dimensions for validation
  const dimensions = await prisma.rubricDimension.findMany({
    where: { projectId },
    select: { id: true, scaleMin: true, scaleMax: true },
  })
  const dimMap = new Map(dimensions.map((d) => [d.id, d]))

  // Validate all scores before writing anything
  for (const item of items) {
    if (!item.feedbackItemId || !Array.isArray(item.scores)) {
      return NextResponse.json(
        { error: 'Each item needs feedbackItemId and scores array' },
        { status: 400 }
      )
    }

    // Verify item belongs to this batch
    const feedbackItem = await prisma.feedbackItem.findUnique({
      where: { id: item.feedbackItemId },
      select: { batchId: true },
    })
    if (!feedbackItem || feedbackItem.batchId !== batchId) {
      return NextResponse.json(
        { error: `Item ${item.feedbackItemId} not in this batch` },
        { status: 400 }
      )
    }

    for (const score of item.scores) {
      const dim = dimMap.get(score.dimensionId)
      if (!dim) {
        return NextResponse.json(
          { error: `Invalid dimension: ${score.dimensionId}` },
          { status: 400 }
        )
      }
      if (score.value < dim.scaleMin || score.value > dim.scaleMax) {
        return NextResponse.json(
          { error: `Score must be ${dim.scaleMin}-${dim.scaleMax}` },
          { status: 400 }
        )
      }
    }
  }

  // Create/update reconciled scores
  let reconciledCount = 0

  for (const item of items) {
    for (const score of item.scores) {
      // Look up the two original scores for audit trail
      const originals = await prisma.score.findMany({
        where: {
          feedbackItemId: item.feedbackItemId,
          dimensionId: score.dimensionId,
          isReconciled: false,
        },
        select: { id: true },
      })

      const reconciledFrom = originals.map((o) => o.id).join(',')

      await prisma.score.upsert({
        where: {
          feedbackItemId_userId_dimensionId_isReconciled: {
            feedbackItemId: item.feedbackItemId,
            userId: session.user.id,
            dimensionId: score.dimensionId,
            isReconciled: true,
          },
        },
        update: {
          value: score.value,
          reconciledFrom,
          notes: item.notes || null,
          scoredAt: new Date(),
        },
        create: {
          feedbackItemId: item.feedbackItemId,
          userId: session.user.id,
          dimensionId: score.dimensionId,
          value: score.value,
          isReconciled: true,
          reconciledFrom,
          notes: item.notes || null,
        },
      })

      reconciledCount++
    }
  }

  return NextResponse.json({ saved: true, reconciledCount })
}
