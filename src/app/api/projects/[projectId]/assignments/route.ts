import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
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

  // Get all evaluators and feedback items for this project
  const [evaluators, feedbackItems] = await Promise.all([
    prisma.projectEvaluator.findMany({
      where: { projectId },
      select: { id: true },
    }),
    prisma.feedbackItem.findMany({
      where: { projectId },
      select: { id: true },
    }),
  ])

  if (evaluators.length === 0) {
    return NextResponse.json(
      { error: 'No evaluators assigned to this project' },
      { status: 400 }
    )
  }

  if (feedbackItems.length === 0) {
    return NextResponse.json(
      { error: 'No feedback items in this project' },
      { status: 400 }
    )
  }

  // Build assignment pairs (evaluator x feedbackItem)
  const assignmentData = evaluators.flatMap((evaluator) =>
    feedbackItems.map((item) => ({
      projectId,
      evaluatorId: evaluator.id,
      feedbackItemId: item.id,
    }))
  )

  const result = await prisma.assignment.createMany({
    data: assignmentData,
    skipDuplicates: true,
  })

  return NextResponse.json(
    { created: result.count, total: assignmentData.length },
    { status: 201 }
  )
}
