import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/projects/[projectId]/batches/[batchId]/escalate
// Creates an Escalation for a single (item, dimension) pair that the pair
// couldn't resolve. Escalation is per-criterion per Amber's 2026-04-09 note:
// "each criterion is standalone." The escalation then appears in the batch
// adjudicator's /adjudicate queue.
//
// Rationale for the escalation (if any) is captured in the pair's existing
// reconciliation notes ("Why we decided what we did") — no separate reason
// field, per Amber's answer to Q5.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; batchId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { projectId, batchId } = await params

  // Caller must be assigned to this batch (either evaluator) or an admin
  const assignment = await prisma.batchAssignment.findUnique({
    where: { batchId_userId: { batchId, userId: session.user.id } },
  })
  if (!assignment && session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
      { error: 'Batch must be in RECONCILING status to escalate' },
      { status: 400 }
    )
  }

  if (!batch.adjudicatorId) {
    return NextResponse.json(
      {
        error:
          'This batch has no adjudicator assigned. Ask an admin to assign one before escalating.',
      },
      { status: 400 }
    )
  }

  const body = await request.json()
  const { feedbackItemId, dimensionId } = body as {
    feedbackItemId?: string
    dimensionId?: string
  }

  if (!feedbackItemId || typeof feedbackItemId !== 'string') {
    return NextResponse.json(
      { error: 'feedbackItemId is required' },
      { status: 400 }
    )
  }

  if (!dimensionId || typeof dimensionId !== 'string') {
    return NextResponse.json(
      { error: 'dimensionId is required' },
      { status: 400 }
    )
  }

  // Verify the item belongs to this batch
  const item = await prisma.feedbackItem.findUnique({
    where: { id: feedbackItemId },
    select: { batchId: true, projectId: true },
  })
  if (!item || item.batchId !== batchId) {
    return NextResponse.json(
      { error: 'Item not found in this batch' },
      { status: 400 }
    )
  }

  // Verify dimension belongs to the project
  const dimension = await prisma.rubricDimension.findUnique({
    where: { id: dimensionId },
    select: { projectId: true },
  })
  if (!dimension || dimension.projectId !== item.projectId) {
    return NextResponse.json(
      { error: 'Invalid dimension for this project' },
      { status: 400 }
    )
  }

  try {
    const escalation = await prisma.escalation.create({
      data: {
        batchId,
        feedbackItemId,
        dimensionId,
        escalatedById: session.user.id,
      },
    })
    return NextResponse.json(escalation, { status: 201 })
  } catch (err) {
    // Unique constraint violation → already escalated
    if (err instanceof Error && err.message.includes('Unique constraint')) {
      return NextResponse.json(
        { error: 'This criterion has already been escalated' },
        { status: 409 }
      )
    }
    throw err
  }
}

// DELETE — withdraw a per-dimension escalation. Only the original escalator
// or an admin can withdraw, and only while the escalation is still unresolved.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; batchId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { projectId, batchId } = await params
  const feedbackItemId = request.nextUrl.searchParams.get('feedbackItemId')
  const dimensionId = request.nextUrl.searchParams.get('dimensionId')
  if (!feedbackItemId || !dimensionId) {
    return NextResponse.json(
      { error: 'feedbackItemId and dimensionId query params are required' },
      { status: 400 }
    )
  }

  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { projectId: true },
  })
  if (!batch || batch.projectId !== projectId) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  }

  const escalation = await prisma.escalation.findUnique({
    where: {
      batchId_feedbackItemId_dimensionId: {
        batchId,
        feedbackItemId,
        dimensionId,
      },
    },
    select: { id: true, escalatedById: true, resolvedAt: true },
  })
  if (!escalation) {
    return NextResponse.json({ error: 'Escalation not found' }, { status: 404 })
  }
  if (escalation.resolvedAt) {
    return NextResponse.json(
      { error: 'Cannot withdraw a resolved escalation' },
      { status: 400 }
    )
  }
  if (
    escalation.escalatedById !== session.user.id &&
    session.user.role !== 'ADMIN'
  ) {
    return NextResponse.json(
      { error: 'Only the escalator (or an admin) can withdraw an escalation' },
      { status: 403 }
    )
  }

  await prisma.escalation.delete({ where: { id: escalation.id } })
  return NextResponse.json({ withdrawn: true })
}
