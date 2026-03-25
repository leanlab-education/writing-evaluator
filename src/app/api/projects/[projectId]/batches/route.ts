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

      return {
        id: batch.id,
        name: batch.name,
        activityId: batch.activityId,
        conjunctionId: batch.conjunctionId,
        size: batch.size,
        sortOrder: batch.sortOrder,
        createdAt: batch.createdAt,
        itemCount: batch._count.feedbackItems,
        scoredItemCount,
        evaluators: batch.assignments.map((a) => a.user),
      }
    })
  )

  return NextResponse.json(batchesWithStats)
}

// POST /api/projects/[projectId]/batches — create batches
// mode: "auto" groups unassigned items by activityId + conjunctionId (Conjunction_ID from CSV)
// mode: "manual" creates a single batch with specified name
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
  const { mode, batchSize = 200 } = body

  if (mode === 'auto') {
    // Get all items not yet in a batch
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

    // Group by activityId + conjunctionId
    const groups = new Map<string, typeof unbatchedItems>()
    for (const item of unbatchedItems) {
      const key = `${item.activityId ?? 'unknown'}::${item.conjunctionId ?? 'unknown'}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    }

    // Create batches from groups, splitting by batchSize
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
            ? `Activity ${activityId} - ${conjunctionId} - Batch ${chunkIdx + 1}`
            : `Activity ${activityId} - ${conjunctionId}`

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

        // Assign items to this batch
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

  // Manual mode: create a single named batch
  const { name } = body
  if (!name) {
    return NextResponse.json(
      { error: 'name is required for manual batch creation' },
      { status: 400 }
    )
  }

  const sortOrder = await prisma.batch.count({ where: { projectId } })
  const batch = await prisma.batch.create({
    data: {
      projectId,
      name,
      activityId: body.activityId || null,
      conjunctionId: body.conjunctionId || null,
      size: batchSize,
      sortOrder,
    },
  })

  return NextResponse.json(batch, { status: 201 })
}
