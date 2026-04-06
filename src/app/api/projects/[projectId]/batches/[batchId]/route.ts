import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
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
  const { status } = body as { status?: string }

  if (!status) {
    return NextResponse.json(
      { error: 'status is required' },
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

  const allowed = VALID_TRANSITIONS[batch.status]
  if (!allowed || !allowed.includes(status)) {
    return NextResponse.json(
      {
        error: `Cannot transition from ${batch.status} to ${status}. Allowed: ${allowed?.join(', ') || 'none'}`,
      },
      { status: 400 }
    )
  }

  const updated = await prisma.batch.update({
    where: { id: batchId },
    data: { status: status as 'DRAFT' | 'SCORING' | 'RECONCILING' | 'COMPLETE' },
  })

  return NextResponse.json(updated)
}
