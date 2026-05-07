import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { recomputeForSessionInterval } from '@/lib/activity-tracker'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  const body = (await request.json().catch(() => ({}))) as {
    sessionId?: string
    bucket?: string
  }
  const { sessionId, bucket } = body
  if (bucket !== 'ANNOTATION' && bucket !== 'OTHER') {
    return NextResponse.json({ error: 'Invalid bucket' }, { status: 400 })
  }

  const userAgent = request.headers.get('user-agent') ?? null
  const now = new Date()

  if (sessionId) {
    const existing = await prisma.activitySession.findUnique({
      where: { id: sessionId },
    })
    if (
      existing &&
      existing.userId === userId &&
      existing.bucket === bucket &&
      !existing.endedAt
    ) {
      const updated = await prisma.activitySession.update({
        where: { id: sessionId },
        data: { lastHeartbeatAt: now },
      })
      await recomputeForSessionInterval(userId, updated.startedAt, updated.lastHeartbeatAt)
      return NextResponse.json({ sessionId: updated.id })
    }
    // Session is gone, mismatched, or closed — fall through and start a new one.
  }

  const created = await prisma.activitySession.create({
    data: {
      userId,
      bucket,
      startedAt: now,
      lastHeartbeatAt: now,
      userAgent,
    },
  })
  await recomputeForSessionInterval(userId, created.startedAt, created.lastHeartbeatAt)
  return NextResponse.json({ sessionId: created.id })
}
