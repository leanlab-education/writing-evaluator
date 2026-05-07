// Server-only activity-tracking helpers.
// Source of truth: ActivitySession rows. ActivityDaily is a derived rollup.

import { prisma } from '@/lib/db'
import {
  SWEEP_STALE_AFTER_MS,
  startOfUtcDay,
  type ActivityBucket,
} from '@/lib/activity-tracker-config'

interface SessionLike {
  startedAt: Date
  lastHeartbeatAt: Date
  endedAt: Date | null
  bucket: ActivityBucket
}

function sessionEndMs(s: SessionLike): number {
  return (s.endedAt ?? s.lastHeartbeatAt).getTime()
}

// Standard interval-merge over [start, end) pairs in ms.
function mergeIntervals(intervals: [number, number][]): [number, number][] {
  if (intervals.length === 0) return []
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = [[sorted[0][0], sorted[0][1]]]
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]
    const [s, e] = sorted[i]
    if (s <= last[1]) {
      if (e > last[1]) last[1] = e
    } else {
      merged.push([s, e])
    }
  }
  return merged
}

function totalSeconds(intervals: [number, number][]): number {
  let totalMs = 0
  for (const [s, e] of intervals) totalMs += e - s
  return Math.round(totalMs / 1000)
}

// Recompute one user-day's ActivityDaily row from sessions.
// Multi-tab / multi-device dedup happens here via mergeIntervals.
export async function computeDailyActivity(userId: string, date: Date): Promise<void> {
  const dayStart = startOfUtcDay(date)
  const dayEnd = new Date(dayStart.getTime() + 86_400_000)

  const sessions = await prisma.activitySession.findMany({
    where: {
      userId,
      startedAt: { lt: dayEnd },
      OR: [
        { endedAt: { gt: dayStart } },
        { endedAt: null, lastHeartbeatAt: { gt: dayStart } },
      ],
    },
    select: {
      bucket: true,
      startedAt: true,
      lastHeartbeatAt: true,
      endedAt: true,
    },
  })

  const byBucket: Record<ActivityBucket, [number, number][]> = {
    ANNOTATION: [],
    OTHER: [],
  }
  for (const s of sessions) {
    const start = Math.max(s.startedAt.getTime(), dayStart.getTime())
    const end = Math.min(sessionEndMs(s), dayEnd.getTime())
    if (end > start) byBucket[s.bucket].push([start, end])
  }

  const annotationSeconds = totalSeconds(mergeIntervals(byBucket.ANNOTATION))
  const otherSeconds = totalSeconds(mergeIntervals(byBucket.OTHER))

  await prisma.activityDaily.upsert({
    where: { userId_date: { userId, date: dayStart } },
    create: { userId, date: dayStart, annotationSeconds, otherSeconds },
    update: { annotationSeconds, otherSeconds },
  })
}

// Recompute every UTC day touched by a session interval (handles cross-midnight).
export async function recomputeForSessionInterval(
  userId: string,
  startedAt: Date,
  endRef: Date
): Promise<void> {
  const startDay = startOfUtcDay(startedAt).getTime()
  const endDay = startOfUtcDay(endRef).getTime()
  const days: Date[] = []
  for (let d = startDay; d <= endDay; d += 86_400_000) days.push(new Date(d))
  await Promise.all(days.map((day) => computeDailyActivity(userId, day)))
}

// Close any session whose last heartbeat is older than the sweep threshold.
// Recomputes affected daily aggregates.
export async function sweepStaleSessions(): Promise<{ closed: number }> {
  const threshold = new Date(Date.now() - SWEEP_STALE_AFTER_MS)
  const stale = await prisma.activitySession.findMany({
    where: { endedAt: null, lastHeartbeatAt: { lt: threshold } },
    select: { id: true, userId: true, startedAt: true, lastHeartbeatAt: true },
  })

  if (stale.length === 0) return { closed: 0 }

  await prisma.$transaction(
    stale.map((s) =>
      prisma.activitySession.update({
        where: { id: s.id },
        data: { endedAt: s.lastHeartbeatAt, endReason: 'swept' },
      })
    )
  )

  await Promise.all(
    stale.map((s) => recomputeForSessionInterval(s.userId, s.startedAt, s.lastHeartbeatAt))
  )

  return { closed: stale.length }
}
