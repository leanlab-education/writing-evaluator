import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { FeedbackSource } from '@/generated/prisma/client'
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

  const batchId = request.nextUrl.searchParams.get('batchId')
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

  // Base query: feedback items without feedbackSource (blinded)
  const feedbackItems = await prisma.feedbackItem.findMany({
    where: {
      projectId,
      ...(batchId ? { batchId } : {}),
    },
    select: {
      id: true,
      projectId: true,
      responseId: true,
      cycleId: true,
      studentId: true,
      activityId: true,
      conjunctionId: true,
      studentText: true,
      feedbackId: true,
      // teacherId intentionally excluded — blinded
      feedbackText: true,
      batchId: true,
      displayOrder: true,
      createdAt: true,
      // feedbackSource intentionally excluded — blinded
      assignments: !isAdmin
        ? {
            where: {
              evaluator: {
                userId: session.user.id,
              },
            },
            select: {
              id: true,
              status: true,
            },
          }
        : false,
    },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  })

  return NextResponse.json(feedbackItems)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { projectId, items, filename } = body as {
    projectId?: string
    items?: unknown[]
    filename?: string
  }

  if (!projectId || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { error: 'projectId and items array are required' },
      { status: 400 }
    )
  }

  // Verify project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Identify which Feedback_IDs already exist in this project so we can
  // report a proper skip count AND attach an importId to only the NEW rows.
  // createMany({skipDuplicates: true}) doesn't return ids, so we do the
  // dedupe manually: pre-check existing, insert only new ones, tag with
  // the Import id.
  const incomingIds = (items as { feedbackId: string }[]).map(
    (i) => i.feedbackId
  )
  const existing = await prisma.feedbackItem.findMany({
    where: { projectId, feedbackId: { in: incomingIds } },
    select: { feedbackId: true },
  })
  const existingIds = new Set(existing.map((e) => e.feedbackId))
  const newItems = (items as {
    responseId?: string
    cycleId?: string
    studentId: string
    activityId?: string
    conjunctionId?: string
    studentText: string
    feedbackId: string
    teacherId?: string
    feedbackText: string
    feedbackSource: string
    optimal?: string
    feedbackType?: string
  }[]).filter((i) => !existingIds.has(i.feedbackId))

  // Get the current max displayOrder so this import's items don't collide
  // with pre-existing ones (rolling upload semantics).
  const maxOrder = await prisma.feedbackItem.aggregate({
    where: { projectId },
    _max: { displayOrder: true },
  })
  const startOrder = (maxOrder._max.displayOrder ?? -1) + 1

  // Create an Import row up front so we can tag the new items with its id.
  const importRow = await prisma.import.create({
    data: {
      projectId,
      filename: filename?.toString().slice(0, 255) || 'unnamed.csv',
      itemCount: newItems.length,
      skippedCount: items.length - newItems.length,
    },
  })

  if (newItems.length > 0) {
    const data = newItems.map((item, index) => ({
      projectId,
      importId: importRow.id,
      responseId: item.responseId || null,
      cycleId: item.cycleId || null,
      studentId: item.studentId,
      activityId: item.activityId || null,
      conjunctionId: item.conjunctionId || null,
      studentText: item.studentText,
      feedbackId: item.feedbackId,
      teacherId: item.teacherId || null,
      feedbackText: item.feedbackText,
      feedbackSource: item.feedbackSource.toUpperCase() as FeedbackSource,
      optimal: item.optimal || null,
      feedbackType: item.feedbackType || null,
      displayOrder: startOrder + index,
    }))

    await prisma.feedbackItem.createMany({ data, skipDuplicates: true })
  }

  return NextResponse.json(
    {
      importId: importRow.id,
      imported: newItems.length,
      skipped: items.length - newItems.length,
      total: items.length,
    },
    { status: 201 }
  )
}
