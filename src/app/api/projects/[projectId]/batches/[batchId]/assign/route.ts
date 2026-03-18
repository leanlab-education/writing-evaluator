import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/projects/[projectId]/batches/[batchId]/assign — assign evaluator(s) to batch
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; batchId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { batchId } = await params
  const body = await request.json()
  const { userIds } = body as { userIds: string[] }

  if (!Array.isArray(userIds) || userIds.length === 0) {
    return NextResponse.json(
      { error: 'userIds array is required' },
      { status: 400 }
    )
  }

  // Verify batch exists
  const batch = await prisma.batch.findUnique({ where: { id: batchId } })
  if (!batch) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  }

  // Create assignments (skip duplicates)
  const created = await Promise.all(
    userIds.map(async (userId) => {
      try {
        return await prisma.batchAssignment.create({
          data: { batchId, userId },
        })
      } catch {
        // Unique constraint violation — already assigned
        return null
      }
    })
  )

  const assignedCount = created.filter(Boolean).length

  return NextResponse.json(
    { assigned: assignedCount, total: userIds.length },
    { status: 201 }
  )
}

// DELETE /api/projects/[projectId]/batches/[batchId]/assign — remove evaluator from batch
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; batchId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { batchId } = await params
  const userId = request.nextUrl.searchParams.get('userId')

  if (!userId) {
    return NextResponse.json(
      { error: 'userId query param is required' },
      { status: 400 }
    )
  }

  await prisma.batchAssignment.deleteMany({
    where: { batchId, userId },
  })

  return NextResponse.json({ removed: true })
}
