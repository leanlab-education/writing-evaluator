import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/projects/[projectId]/imports
// Returns import history for a project — admin sees one row per CSV upload,
// including filename, counts, and the number of items still unbatched from
// that import (so they know what's available to batch).
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

  const imports = await prisma.import.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { feedbackItems: true } },
    },
  })

  // For each import, count unbatched items separately.
  const unbatchedCounts = await Promise.all(
    imports.map((imp) =>
      prisma.feedbackItem.count({
        where: { importId: imp.id, batchId: null },
      })
    )
  )

  const result = imports.map((imp, i) => ({
    id: imp.id,
    filename: imp.filename,
    itemCount: imp.itemCount,
    skippedCount: imp.skippedCount,
    createdAt: imp.createdAt,
    totalItemsRemaining: imp._count.feedbackItems,
    unbatchedRemaining: unbatchedCounts[i],
  }))

  return NextResponse.json(result)
}
