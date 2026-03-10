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

  // Count unique feedback items that have at least one score
  const scoredItems = await prisma.score.findMany({
    where: {
      feedbackItem: { projectId },
      isReconciled: false,
    },
    select: { feedbackItemId: true },
    distinct: ['feedbackItemId'],
  })

  return NextResponse.json({
    scoredItemCount: scoredItems.length,
  })
}
