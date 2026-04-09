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
    select: { status: true, projectId: true, adjudicatorId: true },
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

  const hasAdjudicator = batch.adjudicatorId != null

  // Fetch all original scores for this batch. Notes are stored per-Score
  // row but the scoring UI writes the same notes value to every dimension
  // row for an (item, user) pair, so we can read notes from any one of a
  // coder's Score rows for a given item.
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

  // Build a lookup: (feedbackItemId, userId) -> notes (first non-null found).
  // Used to attach each coder's per-item notes to the discrepancy response
  // so the reconcile UI can show "why I scored this" for both coders.
  const notesByItemUser = new Map<string, string>()
  for (const score of scores) {
    const key = `${score.feedbackItemId}::${score.userId}`
    if (score.notes && score.notes.trim() && !notesByItemUser.has(key)) {
      notesByItemUser.set(key, score.notes)
    }
  }

  // Open escalations for this batch, keyed by (feedbackItemId, dimensionId)
  const openEscalations = await prisma.escalation.findMany({
    where: { batchId, resolvedAt: null },
    select: {
      id: true,
      feedbackItemId: true,
      dimensionId: true,
      createdAt: true,
      escalatedBy: { select: { id: true, name: true, email: true } },
    },
  })
  const escalationByKey = new Map<
    string,
    {
      id: string
      escalatedBy: { id: string; name: string | null; email: string }
      createdAt: Date
    }
  >()
  for (const esc of openEscalations) {
    escalationByKey.set(`${esc.feedbackItemId}::${esc.dimensionId}`, {
      id: esc.id,
      escalatedBy: esc.escalatedBy,
      createdAt: esc.createdAt,
    })
  }

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
  type ItemCoder = {
    userId: string
    name: string | null
    email: string
    notes: string | null
  }

  const itemMap = new Map<
    string,
    {
      feedbackItemId: string
      studentText: string
      feedbackText: string
      activityId: string | null
      conjunctionId: string | null
      displayOrder: number | null
      coders: ItemCoder[] // both coders who scored this item (for notes display)
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
        escalation: {
          id: string
          escalatedByName: string | null
          escalatedByEmail: string
        } | null
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
        coders: [],
        discrepancies: [],
        agreements: [],
      })
    }

    const item = itemMap.get(fid)!

    // Record each coder once per item with their notes
    for (const ev of group.evaluators) {
      if (!item.coders.some((c) => c.userId === ev.userId)) {
        item.coders.push({
          userId: ev.userId,
          name: ev.name,
          email: ev.email,
          notes: notesByItemUser.get(`${fid}::${ev.userId}`) ?? null,
        })
      }
    }

    const evals = group.evaluators

    if (evals.length === 2) {
      if (evals[0].value !== evals[1].value) {
        const escKey = `${fid}::${group.dimension.id}`
        const esc = escalationByKey.get(escKey)
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
          escalation: esc
            ? {
                id: esc.id,
                escalatedByName: esc.escalatedBy.name,
                escalatedByEmail: esc.escalatedBy.email,
              }
            : null,
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
    hasAdjudicator,
    summary: {
      totalItems: itemMap.size,
      discrepantItems: discrepantItems.length,
      totalDiscrepancies,
      totalDimensionPairs,
      reconciledCount,
    },
  })
}
