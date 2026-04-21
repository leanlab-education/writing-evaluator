import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { maybeAutoTransitionToReconciling } from '@/lib/reconciliation'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const projectId = request.nextUrl.searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json(
      { error: 'projectId is required' },
      { status: 400 }
    )
  }

  const feedbackItemId = request.nextUrl.searchParams.get('feedbackItemId')
  const isAdmin = session.user.role === 'ADMIN'

  // Evaluators can only access projects they're assigned to
  if (!isAdmin) {
    const membership = await prisma.projectEvaluator.findUnique({
      where: { projectId_userId: { projectId, userId: session.user.id } },
    })
    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const scores = await prisma.score.findMany({
    where: {
      feedbackItem: { projectId },
      ...(feedbackItemId ? { feedbackItemId } : {}),
      // Evaluators only see their own scores
      ...(!isAdmin ? { userId: session.user.id } : {}),
    },
    include: {
      dimension: {
        select: { key: true, label: true },
      },
      user: {
        select: { id: true, email: true, name: true },
      },
    },
    orderBy: [{ feedbackItemId: 'asc' }, { scoredAt: 'asc' }],
  })

  return NextResponse.json(scores)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { feedbackItemId, scores, notes, startedAt, durationSeconds } = body

  if (!feedbackItemId || !Array.isArray(scores) || scores.length === 0) {
    return NextResponse.json(
      { error: 'feedbackItemId and scores array are required' },
      { status: 400 }
    )
  }

  // Verify the feedback item exists and user has access to its project
  const feedbackItem = await prisma.feedbackItem.findUnique({
    where: { id: feedbackItemId },
    select: { id: true, projectId: true, batchId: true },
  })
  if (!feedbackItem) {
    return NextResponse.json(
      { error: 'Feedback item not found' },
      { status: 404 }
    )
  }

  const membership = await prisma.projectEvaluator.findUnique({
    where: { projectId_userId: { projectId: feedbackItem.projectId, userId: session.user.id } },
  })
  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Verify batch is in a scoreable state and not hidden from this user
  if (feedbackItem.batchId) {
    const [batch, assignment] = await Promise.all([
      prisma.batch.findUnique({
        where: { id: feedbackItem.batchId },
        select: { status: true, isHidden: true },
      }),
      prisma.batchAssignment.findFirst({
        where: {
          batchId: feedbackItem.batchId,
          userId: session.user.id,
          OR: [{ teamReleaseId: null }, { teamRelease: { isVisible: true } }],
        },
        select: { id: true },
      }),
    ])
    if (!batch || !['SCORING', 'RECONCILING'].includes(batch.status)) {
      return NextResponse.json({ error: 'Scoring is not open for this batch' }, { status: 403 })
    }
    if (batch.isHidden && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Scoring is not open for this batch' }, { status: 403 })
    }
    if (!assignment && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Scoring is not open for this batch' }, { status: 403 })
    }
  }

  // Validate each score's dimensionId belongs to this project and value is within scale
  const dimensions = await prisma.rubricDimension.findMany({
    where: { projectId: feedbackItem.projectId },
    select: { id: true, scaleMin: true, scaleMax: true },
  })
  const dimMap = new Map(dimensions.map((d) => [d.id, d]))
  for (const score of scores as { dimensionId: string; value: number }[]) {
    const dim = dimMap.get(score.dimensionId)
    if (!dim) {
      return NextResponse.json({ error: `Invalid dimension: ${score.dimensionId}` }, { status: 400 })
    }
    if (score.value < dim.scaleMin || score.value > dim.scaleMax) {
      return NextResponse.json({ error: `Score value must be between ${dim.scaleMin} and ${dim.scaleMax}` }, { status: 400 })
    }
  }

  // Create all score rows in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const createdScores = await Promise.all(
      scores.map(
        (score: { dimensionId: string; value: number; rationale?: string }) =>
          tx.score.create({
            data: {
              feedbackItemId,
              userId: session.user.id,
              dimensionId: score.dimensionId,
              value: score.value,
              rationale: score.rationale || null,
              notes: notes || null,
              startedAt: startedAt ? new Date(startedAt) : null,
              durationSeconds: durationSeconds || null,
            },
          })
      )
    )

    // Update assignment status to COMPLETE if one exists for this user
    await tx.assignment.updateMany({
      where: {
        feedbackItemId,
        evaluator: {
          userId: session.user.id,
        },
      },
      data: {
        status: 'COMPLETE',
      },
    })

    return createdScores
  })

  // After a successful save, check whether this batch is now fully scored
  // by every evaluator. If so, auto-transition SCORING → RECONCILING.
  // Fire-and-forget: failure here must not break the save response.
  if (feedbackItem.batchId) {
    try {
      await maybeAutoTransitionToReconciling(feedbackItem.batchId)
    } catch (err) {
      console.error('Auto-transition check failed:', err)
    }
  }

  return NextResponse.json(result, { status: 201 })
}

// PUT /api/scores — auto-save upsert (partial or full)
export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { feedbackItemId, scores, notes, startedAt } = body

  if (!feedbackItemId) {
    return NextResponse.json(
      { error: 'feedbackItemId is required' },
      { status: 400 }
    )
  }

  // Verify the feedback item exists and user has access to its project
  const feedbackItem = await prisma.feedbackItem.findUnique({
    where: { id: feedbackItemId },
    select: { projectId: true, batchId: true },
  })
  if (!feedbackItem) {
    return NextResponse.json({ error: 'Feedback item not found' }, { status: 404 })
  }
  const putMembership = await prisma.projectEvaluator.findUnique({
    where: { projectId_userId: { projectId: feedbackItem.projectId, userId: session.user.id } },
  })
  if (!putMembership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Verify batch is in a scoreable state and not hidden from this user
  if (feedbackItem.batchId) {
    const [batch, assignment] = await Promise.all([
      prisma.batch.findUnique({
        where: { id: feedbackItem.batchId },
        select: { status: true, isHidden: true },
      }),
      prisma.batchAssignment.findFirst({
        where: {
          batchId: feedbackItem.batchId,
          userId: session.user.id,
          OR: [{ teamReleaseId: null }, { teamRelease: { isVisible: true } }],
        },
        select: { id: true },
      }),
    ])
    if (!batch || !['SCORING', 'RECONCILING'].includes(batch.status)) {
      return NextResponse.json({ error: 'Scoring is not open for this batch' }, { status: 403 })
    }
    if (batch.isHidden && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Scoring is not open for this batch' }, { status: 403 })
    }
    if (!assignment && session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Scoring is not open for this batch' }, { status: 403 })
    }
  }

  // Validate score dimensions and values if scores are provided
  if (Array.isArray(scores) && scores.length > 0) {
    const dimensions = await prisma.rubricDimension.findMany({
      where: { projectId: feedbackItem.projectId },
      select: { id: true, scaleMin: true, scaleMax: true },
    })
    const dimMap = new Map(dimensions.map((d) => [d.id, d]))
    for (const score of scores as { dimensionId: string; value: number }[]) {
      const dim = dimMap.get(score.dimensionId)
      if (!dim) {
        return NextResponse.json({ error: `Invalid dimension: ${score.dimensionId}` }, { status: 400 })
      }
      if (score.value < dim.scaleMin || score.value > dim.scaleMax) {
        return NextResponse.json({ error: `Score value must be between ${dim.scaleMin} and ${dim.scaleMax}` }, { status: 400 })
      }
    }
  }

  // Upsert each score dimension — run sequentially to avoid race conditions
  if (Array.isArray(scores) && scores.length > 0) {
    for (const score of scores as { dimensionId: string; value: number }[]) {
      try {
        await prisma.score.upsert({
          where: {
            feedbackItemId_userId_dimensionId_isReconciled: {
              feedbackItemId,
              userId: session.user.id,
              dimensionId: score.dimensionId,
              isReconciled: false,
            },
          },
          update: {
            value: score.value,
            scoredAt: new Date(),
            ...(notes !== undefined ? { notes } : {}),
            ...(startedAt ? { startedAt: new Date(startedAt) } : {}),
          },
          create: {
            feedbackItemId,
            userId: session.user.id,
            dimensionId: score.dimensionId,
            value: score.value,
            notes: notes || null,
            startedAt: startedAt ? new Date(startedAt) : null,
          },
        })
      } catch (e: unknown) {
        // P2002: concurrent request already inserted this row — fall back to update
        if ((e as { code?: string }).code === 'P2002') {
          await prisma.score.updateMany({
            where: {
              feedbackItemId,
              userId: session.user.id,
              dimensionId: score.dimensionId,
              isReconciled: false,
            },
            data: {
              value: score.value,
              scoredAt: new Date(),
              ...(notes !== undefined ? { notes } : {}),
              ...(startedAt ? { startedAt: new Date(startedAt) } : {}),
            },
          })
        } else {
          throw e
        }
      }
    }
  }

  // If only notes changed (no scores), update notes on existing scores
  if (notes !== undefined && (!scores || scores.length === 0)) {
    await prisma.score.updateMany({
      where: {
        feedbackItemId,
        userId: session.user.id,
        isReconciled: false,
      },
      data: { notes },
    })
  }

  // After a successful auto-save, check whether this batch is now fully
  // scored by every evaluator. If so, auto-transition SCORING → RECONCILING.
  if (feedbackItem.batchId) {
    try {
      await maybeAutoTransitionToReconciling(feedbackItem.batchId)
    } catch (err) {
      console.error('Auto-transition check failed:', err)
    }
  }

  return NextResponse.json({ saved: true })
}
