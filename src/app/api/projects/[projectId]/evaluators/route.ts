import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _request: NextRequest,
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

  const evaluators = await prisma.projectEvaluator.findMany({
    where: { projectId },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
      _count: {
        select: { assignments: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  // Fetch completed assignment counts per evaluator
  const completedCounts = await prisma.assignment.groupBy({
    by: ['evaluatorId'],
    where: {
      projectId,
      status: 'COMPLETE',
    },
    _count: { id: true },
  })

  const completedMap = new Map(
    completedCounts.map((c) => [c.evaluatorId, c._count.id])
  )

  const result = evaluators.map((ev) => ({
    ...ev,
    completedCount: completedMap.get(ev.id) || 0,
  }))

  return NextResponse.json(result)
}

export async function POST(
  request: NextRequest,
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
  const { userId } = body

  if (!userId) {
    return NextResponse.json(
      { error: 'userId is required' },
      { status: 400 }
    )
  }

  // Verify project and user exist
  const [project, user] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ])

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Check for existing assignment
  const existing = await prisma.projectEvaluator.findUnique({
    where: {
      projectId_userId: { projectId, userId },
    },
  })

  if (existing) {
    return NextResponse.json(
      { error: 'Evaluator is already assigned to this project' },
      { status: 409 }
    )
  }

  const evaluator = await prisma.projectEvaluator.create({
    data: { projectId, userId },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  })

  return NextResponse.json(evaluator, { status: 201 })
}
