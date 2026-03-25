import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
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

  // Verify the feedback item exists
  const feedbackItem = await prisma.feedbackItem.findUnique({
    where: { id: feedbackItemId },
  })
  if (!feedbackItem) {
    return NextResponse.json(
      { error: 'Feedback item not found' },
      { status: 404 }
    )
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

  return NextResponse.json({ saved: true })
}
