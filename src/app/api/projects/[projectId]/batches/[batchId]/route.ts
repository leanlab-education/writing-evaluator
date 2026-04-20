import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { autoReconcileAgreedScores } from '@/lib/reconciliation'
import { NextRequest, NextResponse } from 'next/server'

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SCORING'],
  SCORING: ['RECONCILING', 'COMPLETE'],
  RECONCILING: ['COMPLETE', 'SCORING'],
  COMPLETE: ['SCORING'],
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; batchId: string }> }
) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { projectId, batchId } = await params
  const body = await request.json()
  const { status, adjudicatorId, isHidden } = body as {
    status?: string
    adjudicatorId?: string | null
    isHidden?: boolean
  }

  if (
    status === undefined &&
    adjudicatorId === undefined &&
    isHidden === undefined
  ) {
    return NextResponse.json(
      { error: 'status, adjudicatorId, or isHidden is required' },
      { status: 400 }
    )
  }

  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { status: true, projectId: true },
  })

  if (!batch || batch.projectId !== projectId) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  }

  // Validate adjudicator exists and (if non-null) is a real user in this project
  if (adjudicatorId !== undefined && adjudicatorId !== null) {
    const user = await prisma.user.findUnique({
      where: { id: adjudicatorId },
      select: { id: true },
    })
    if (!user) {
      return NextResponse.json(
        { error: 'Adjudicator user not found' },
        { status: 400 }
      )
    }
  }

  if (status !== undefined) {
    const allowed = VALID_TRANSITIONS[batch.status]
    if (!allowed || !allowed.includes(status)) {
      return NextResponse.json(
        {
          error: `Cannot transition from ${batch.status} to ${status}. Allowed: ${allowed?.join(', ') || 'none'}`,
        },
        { status: 400 }
      )
    }
  }

  const updated = await prisma.batch.update({
    where: { id: batchId },
    data: {
      ...(status !== undefined
        ? {
            status: status as
              | 'DRAFT'
              | 'SCORING'
              | 'RECONCILING'
              | 'COMPLETE',
          }
        : {}),
      ...(adjudicatorId !== undefined ? { adjudicatorId } : {}),
      ...(isHidden !== undefined ? { isHidden } : {}),
    },
  })

  // When transitioning to RECONCILING, auto-reconcile dimensions where both
  // evaluators already agree. This keeps the reconciliation UI focused on
  // actual disagreements and ensures a complete reconciled dataset for export.
  if (
    status !== undefined &&
    batch.status === 'SCORING' &&
    status === 'RECONCILING'
  ) {
    await autoReconcileAgreedScores(batchId)
  }

  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; batchId: string }> }
) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { projectId, batchId } = await params

  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { status: true, projectId: true },
  })

  if (!batch || batch.projectId !== projectId) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  }

  if (batch.status !== 'DRAFT') {
    return NextResponse.json(
      { error: 'Only DRAFT batches can be deleted' },
      { status: 400 }
    )
  }

  await prisma.batch.delete({ where: { id: batchId } })

  return NextResponse.json({ success: true })
}
