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
  const { projectId, items } = body

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

  const data = items.map(
    (
      item: {
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
      },
      index: number
    ) => ({
      projectId,
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
      displayOrder: index,
    })
  )

  const result = await prisma.feedbackItem.createMany({
    data,
    skipDuplicates: true,
  })

  return NextResponse.json(
    { imported: result.count, total: items.length },
    { status: 201 }
  )
}
