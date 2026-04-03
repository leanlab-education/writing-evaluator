import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

const VALID_STATUSES = ['SETUP', 'ACTIVE', 'RECONCILIATION', 'COMPLETE']

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

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      rubric: { orderBy: { sortOrder: 'asc' } },
      _count: {
        select: {
          feedbackItems: true,
          evaluators: true,
          assignments: true,
        },
      },
    },
  })

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  return NextResponse.json(project)
}

export async function PATCH(
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
  const { status, studyflowStudyId } = body

  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      {
        error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
      },
      { status: 400 }
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {}
  if (status) updateData.status = status
  if (studyflowStudyId !== undefined) updateData.studyflowStudyId = studyflowStudyId || null

  const project = await prisma.project.update({
    where: { id: projectId },
    data: updateData,
    include: {
      rubric: { orderBy: { sortOrder: 'asc' } },
      _count: {
        select: {
          feedbackItems: true,
          evaluators: true,
          assignments: true,
        },
      },
    },
  })

  return NextResponse.json(project)
}
