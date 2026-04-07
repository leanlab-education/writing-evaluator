import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/projects/[projectId]/batches — list batches with stats
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { projectId } = await params

  // Evaluators can only access projects they're assigned to
  if (session.user.role !== 'ADMIN') {
    const membership = await prisma.projectEvaluator.findUnique({
      where: { projectId_userId: { projectId, userId: session.user.id } },
    })
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const batches = await prisma.batch.findMany({
    where: { projectId },
    include: {
      _count: { select: { feedbackItems: true } },
      assignments: {
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      },
    },
    orderBy: { sortOrder: 'asc' },
  })

  // Fetch dimension count once — same for all batches in this project
  const dimensionCount = await prisma.rubricDimension.count({
    where: { projectId },
  })

  // For each batch, count scored items with a single groupBy query (no per-item loop)
  const batchesWithStats = await Promise.all(
    batches.map(async (batch) => {
      let scoredItemCount = 0

      if (dimensionCount > 0 && batch._count.feedbackItems > 0) {
        // Find (feedbackItemId, userId) pairs that have scored all dimensions
        const fullyScoredPairs = await prisma.score.groupBy({
          by: ['feedbackItemId', 'userId'],
          where: {
            feedbackItem: { batchId: batch.id },
            isReconciled: false,
          },
          _count: { dimensionId: true },
          having: {
            dimensionId: { _count: { gte: dimensionCount } },
          },
        })
        // Count unique items that have at least one evaluator who scored all dimensions
        scoredItemCount = new Set(fullyScoredPairs.map((p) => p.feedbackItemId))
          .size
      }

      // For RECONCILING batches, compute discrepancy stats
      let discrepancyCount: number | undefined
      let reconciledCount: number | undefined
      if (batch.status === 'RECONCILING') {
        const origScores = await prisma.score.findMany({
          where: { feedbackItem: { batchId: batch.id }, isReconciled: false },
          select: { feedbackItemId: true, dimensionId: true, value: true },
        })
        const scoreGroups = new Map<string, number[]>()
        for (const s of origScores) {
          const key = `${s.feedbackItemId}::${s.dimensionId}`
          if (!scoreGroups.has(key)) scoreGroups.set(key, [])
          scoreGroups.get(key)!.push(s.value)
        }
        discrepancyCount = 0
        for (const [, values] of scoreGroups) {
          if (values.length === 2 && values[0] !== values[1]) discrepancyCount++
        }
        reconciledCount = await prisma.score.count({
          where: { feedbackItem: { batchId: batch.id }, isReconciled: true },
        })
      }

      return {
        id: batch.id,
        name: batch.name,
        activityId: batch.activityId,
        conjunctionId: batch.conjunctionId,
        status: batch.status,
        type: batch.type,
        size: batch.size,
        sortOrder: batch.sortOrder,
        createdAt: batch.createdAt,
        itemCount: batch._count.feedbackItems,
        scoredItemCount,
        discrepancyCount,
        reconciledCount,
        evaluators: batch.assignments.map((a) => ({
          ...a.user,
          scoringRole: a.scoringRole,
        })),
      }
    })
  )

  return NextResponse.json(batchesWithStats)
}

// POST /api/projects/[projectId]/batches — create a batch
// Body: {
//   name?: string,              — auto-generated if omitted
//   activityId?: string,        — filter items by activity
//   conjunctionId?: string,     — filter items by conjunction
//   batchSize?: number,         — how many items (default 250, or "all" for all matching)
//   type?: "REGULAR" | "CALIBRATION",
//   randomize?: boolean,        — shuffle AI/HUMAN order (default true)
//   itemIds?: string[],         — explicit item selection (for calibration batches)
//   mode?: "auto",              — legacy: auto-group by activity+conjunction
// }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { projectId } = await params
  const body = await request.json()

  // Legacy auto mode — kept for backward compat
  if (body.mode === 'auto') {
    return handleAutoMode(projectId, body)
  }

  const {
    activityId,
    conjunctionId,
    batchSize = 250,
    type = 'REGULAR',
    randomize = true,
    itemIds,
  } = body

  let name = body.name as string | undefined

  // For calibration batches with explicit item IDs
  if (type === 'CALIBRATION' && Array.isArray(itemIds) && itemIds.length > 0) {
    const sortOrder = await prisma.batch.count({ where: { projectId } })
    const batchName = name || `Calibration Batch`

    const batch = await prisma.batch.create({
      data: {
        projectId,
        name: batchName,
        type: 'CALIBRATION',
        size: itemIds.length,
        sortOrder,
      },
    })

    await prisma.feedbackItem.updateMany({
      where: { id: { in: itemIds }, projectId },
      data: { batchId: batch.id },
    })

    if (randomize) {
      await randomizeDisplayOrder(batch.id)
    }

    return NextResponse.json(
      { id: batch.id, name: batchName, itemCount: itemIds.length, type },
      { status: 201 }
    )
  }

  // Standard batch creation: filter → take N → assign to batch
  const whereClause: Record<string, unknown> = {
    projectId,
    batchId: null, // Only unbatched items
  }
  if (activityId) whereClause.activityId = activityId
  if (conjunctionId) whereClause.conjunctionId = conjunctionId

  // Count available items
  const availableCount = await prisma.feedbackItem.count({
    where: whereClause,
  })

  if (availableCount === 0) {
    return NextResponse.json(
      { error: 'No matching unbatched items found' },
      { status: 400 }
    )
  }

  const takeCount =
    batchSize === 'all' ? availableCount : Math.min(batchSize, availableCount)

  // Fetch items to put in this batch
  const items = await prisma.feedbackItem.findMany({
    where: whereClause,
    take: takeCount,
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })

  // Auto-generate batch name if not provided
  if (!name) {
    const existingCount = await prisma.batch.count({
      where: { projectId, activityId: activityId || undefined },
    })
    const actPart = activityId ? `Activity ${activityId}` : 'All Activities'
    const conjPart = conjunctionId ? ` / ${conjunctionId}` : ''
    name = `${actPart}${conjPart} / Batch ${existingCount + 1}`
  }

  const sortOrder = await prisma.batch.count({ where: { projectId } })

  const batch = await prisma.batch.create({
    data: {
      projectId,
      name,
      activityId: activityId || null,
      conjunctionId: conjunctionId || null,
      type: type === 'CALIBRATION' ? 'CALIBRATION' : 'REGULAR',
      size: takeCount,
      sortOrder,
    },
  })

  // Assign items to batch
  await prisma.feedbackItem.updateMany({
    where: { id: { in: items.map((i) => i.id) } },
    data: { batchId: batch.id },
  })

  // Randomize display order within batch (shuffles AI/HUMAN)
  if (randomize) {
    await randomizeDisplayOrder(batch.id)
  }

  return NextResponse.json(
    { id: batch.id, name, itemCount: items.length, type },
    { status: 201 }
  )
}

// Shuffle displayOrder for items in a batch (Fisher-Yates via DB)
async function randomizeDisplayOrder(batchId: string) {
  const items = await prisma.feedbackItem.findMany({
    where: { batchId },
    select: { id: true },
  })

  // Fisher-Yates shuffle using CSPRNG (blinding-critical randomness)
  const { randomInt } = await import('crypto')
  const indices = items.map((_, i) => i)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }

  // Update display orders in parallel
  await Promise.all(
    items.map((item, i) =>
      prisma.feedbackItem.update({
        where: { id: item.id },
        data: { displayOrder: indices[i] },
      })
    )
  )
}

// Legacy auto-group mode (kept for backward compat)
async function handleAutoMode(
  projectId: string,
  body: { batchSize?: number }
) {
  const batchSize = body.batchSize || 250

  const unbatchedItems = await prisma.feedbackItem.findMany({
    where: { projectId, batchId: null },
    orderBy: { displayOrder: 'asc' },
  })

  if (unbatchedItems.length === 0) {
    return NextResponse.json(
      { error: 'No unbatched items found' },
      { status: 400 }
    )
  }

  const groups = new Map<string, typeof unbatchedItems>()
  for (const item of unbatchedItems) {
    const key = `${item.activityId ?? 'unknown'}::${item.conjunctionId ?? 'unknown'}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }

  const createdBatches: { id: string; name: string; itemCount: number }[] = []
  let sortOrder = await prisma.batch.count({ where: { projectId } })

  for (const [key, groupItems] of groups) {
    const [activityId, conjunctionId] = key.split('::')
    const chunks: (typeof groupItems)[] = []

    for (let i = 0; i < groupItems.length; i += batchSize) {
      chunks.push(groupItems.slice(i, i + batchSize))
    }

    for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
      const chunk = chunks[chunkIdx]
      const batchName =
        chunks.length > 1
          ? `Activity ${activityId} / ${conjunctionId} / Batch ${chunkIdx + 1}`
          : `Activity ${activityId} / ${conjunctionId}`

      const batch = await prisma.batch.create({
        data: {
          projectId,
          name: batchName,
          activityId: activityId === 'unknown' ? null : activityId,
          conjunctionId: conjunctionId === 'unknown' ? null : conjunctionId,
          size: batchSize,
          sortOrder: sortOrder++,
        },
      })

      await prisma.feedbackItem.updateMany({
        where: { id: { in: chunk.map((item) => item.id) } },
        data: { batchId: batch.id },
      })

      createdBatches.push({
        id: batch.id,
        name: batch.name,
        itemCount: chunk.length,
      })
    }
  }

  return NextResponse.json(
    { created: createdBatches.length, batches: createdBatches },
    { status: 201 }
  )
}
