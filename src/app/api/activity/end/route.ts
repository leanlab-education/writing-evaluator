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

  // sendBeacon Blobs come through as application/json text — try JSON first,
  // fall back to raw text parse.
  let body: { sessionId?: string; reason?: string } = {}
  try {
    body = await request.json()
  } catch {
    try {
      const text = await request.text()
      if (text) body = JSON.parse(text)
    } catch {
      // ignore
    }
  }

  const { sessionId, reason } = body
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
  }

  const existing = await prisma.activitySession.findUnique({
    where: { id: sessionId },
  })
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }
  if (existing.endedAt) {
    return NextResponse.json({ ok: true, alreadyEnded: true })
  }

  const endedAt = new Date()
  const updated = await prisma.activitySession.update({
    where: { id: sessionId },
    data: { endedAt, endReason: reason ?? 'beacon' },
  })
  await recomputeForSessionInterval(userId, updated.startedAt, endedAt)
  return NextResponse.json({ ok: true })
}
