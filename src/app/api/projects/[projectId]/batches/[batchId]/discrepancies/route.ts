import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/projects/[projectId]/batches/[batchId]/discrepancies
// Returns items with scoring discrepancies between evaluators for reconciliation.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; batchId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { projectId, batchId } = await params

  // Admin or evaluator assigned to this batch
  if (session.user.role !== 'ADMIN') {
    const assignment = await prisma.batchAssignment.findUnique({
      where: { batchId_userId: { batchId, userId: session.user.id } },
    })
    if (!assignment) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
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

  // Fetch all original scores for this batch
  const scores = await prisma.score.findMany({
    where: {
      feedbackItem: { batchId },
      isReconciled: false,
    },
    include: {
      feedbackItem: {
        select: {
          id: true,
          studentText: true,
          feedbackText: true,
          activityId: true,
          conjunctionId: true,
          displayOrder: true,
        },
      },
      user: { select: { id: true, name: true, email: true } },
      dimension: {
        select: {
          id: true,
          key: true,
          label: true,
          sortOrder: true,
          scaleMin: true,
          scaleMax: true,
          scoreLabelJson: true,
        },
      },
    },
  })

  // Group by (feedbackItemId, dimensionId) to find discrepancies
  const groupMap = new Map<
    string,
    {
      feedbackItem: (typeof scores)[0]['feedbackItem']
      dimension: (typeof scores)[0]['dimension']
      evaluators: {
        userId: string
        name: string | null
        email: string
        value: number
        scoreId: string
      }[]
    }
  >()

  for (const score of scores) {
    const key = `${score.feedbackItemId}::${score.dimensionId}`
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        feedbackItem: score.feedbackItem,
        dimension: score.dimension,
        evaluators: [],
      })
    }
    groupMap.get(key)!.evaluators.push({
      userId: score.user.id,
      name: score.user.name,
      email: score.user.email,
      value: score.value,
      scoreId: score.id,
    })
  }

  // Build per-item response with discrepancies and agreements
  const itemMap = new Map<
    string,
    {
      feedbackItemId: string
      studentText: string
      feedbackText: string
      activityId: string | null
      conjunctionId: string | null
      displayOrder: number | null
      discrepancies: {
        dimensionId: string
        dimensionLabel: string
        dimensionKey: string
        sortOrder: number
        scaleMin: number
        scaleMax: number
        scoreLabelJson: string | null
        evaluatorA: { userId: string; name: string | null; email: string; value: number; scoreId: string }
        evaluatorB: { userId: string; name: string | null; email: string; value: number; scoreId: string }
      }[]
      agreements: {
        dimensionId: string
        dimensionLabel: string
        value: number
      }[]
    }
  >()

  for (const [, group] of groupMap) {
    const fid = group.feedbackItem.id
    if (!itemMap.has(fid)) {
      itemMap.set(fid, {
        feedbackItemId: fid,
        studentText: group.feedbackItem.studentText,
        feedbackText: group.feedbackItem.feedbackText,
        activityId: group.feedbackItem.activityId,
        conjunctionId: group.feedbackItem.conjunctionId,
        displayOrder: group.feedbackItem.displayOrder,
        discrepancies: [],
        agreements: [],
      })
    }

    const item = itemMap.get(fid)!
    const evals = group.evaluators

    if (evals.length === 2) {
      if (evals[0].value !== evals[1].value) {
        item.discrepancies.push({
          dimensionId: group.dimension.id,
          dimensionLabel: group.dimension.label,
          dimensionKey: group.dimension.key,
          sortOrder: group.dimension.sortOrder,
          scaleMin: group.dimension.scaleMin,
          scaleMax: group.dimension.scaleMax,
          scoreLabelJson: group.dimension.scoreLabelJson,
          evaluatorA: evals[0],
          evaluatorB: evals[1],
        })
      } else {
        item.agreements.push({
          dimensionId: group.dimension.id,
          dimensionLabel: group.dimension.label,
          value: evals[0].value,
        })
      }
    }
  }

  // Filter to only items with at least one discrepancy, sort by displayOrder
  const discrepantItems = Array.from(itemMap.values())
    .filter((item) => item.discrepancies.length > 0)
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))

  // Sort discrepancies within each item by dimension sortOrder
  for (const item of discrepantItems) {
    item.discrepancies.sort((a, b) => a.sortOrder - b.sortOrder)
  }

  // Count reconciled scores for progress tracking
  const reconciledCount = await prisma.score.count({
    where: {
      feedbackItem: { batchId },
      isReconciled: true,
    },
  })

  // Total scoreable dimension pairs = items in batch × dimensions scored by 2 evaluators
  const totalDimensionPairs = Array.from(groupMap.values()).filter(
    (g) => g.evaluators.length === 2
  ).length

  const totalDiscrepancies = discrepantItems.reduce(
    (sum, item) => sum + item.discrepancies.length,
    0
  )

  return NextResponse.json({
    items: discrepantItems,
    summary: {
      totalItems: itemMap.size,
      discrepantItems: discrepantItems.length,
      totalDiscrepancies,
      totalDimensionPairs,
      reconciledCount,
    },
  })
}
