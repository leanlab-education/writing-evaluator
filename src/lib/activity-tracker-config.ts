// Activity tracker configuration shared between client and server.
// No Prisma imports — safe to import from client components.

export const HEARTBEAT_INTERVAL_MS = 20_000
export const IDLE_THRESHOLD_MS = 5 * 60_000
export const SWEEP_STALE_AFTER_MS = 2 * 60_000

export const ACTIVITY_EVENTS = [
  'mousemove',
  'keydown',
  'click',
  'scroll',
  'touchstart',
] as const

export type ActivityBucket = 'ANNOTATION' | 'OTHER'

export function bucketForPath(pathname: string): ActivityBucket | null {
  if (pathname.startsWith('/evaluate/')) return 'ANNOTATION'
  if (
    pathname === '/login' ||
    pathname.startsWith('/invite/') ||
    pathname.startsWith('/reset-password')
  ) {
    return null
  }
  return 'OTHER'
}

// UTC date math — keeps display deterministic regardless of viewer TZ.
export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

// ISO week — Monday is the first day.
export function startOfUtcWeek(d: Date): Date {
  const day = startOfUtcDay(d)
  const dow = day.getUTCDay() // 0 = Sun .. 6 = Sat
  const offset = (dow + 6) % 7 // 0 if Mon .. 6 if Sun
  return new Date(day.getTime() - offset * 86_400_000)
}

export function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

export type Period = 'week' | 'month' | 'all' | 'custom'

export function periodRange(
  period: Period,
  options: { now?: Date; from?: Date; to?: Date } = {}
): { from: Date; to: Date } {
  const now = options.now ?? new Date()
  // End is exclusive; we cap at end of today (start of tomorrow UTC).
  const endOfToday = new Date(startOfUtcDay(now).getTime() + 86_400_000)
  switch (period) {
    case 'week':
      return { from: startOfUtcWeek(now), to: endOfToday }
    case 'month':
      return { from: startOfUtcMonth(now), to: endOfToday }
    case 'all':
      return { from: new Date(0), to: endOfToday }
    case 'custom': {
      if (!options.from || !options.to) {
        throw new Error('Custom period requires from and to')
      }
      return {
        from: startOfUtcDay(options.from),
        // `to` is treated as inclusive end-day; bump to next-day start (exclusive).
        to: new Date(startOfUtcDay(options.to).getTime() + 86_400_000),
      }
    }
  }
}

// Display time as hours to 1 decimal place (e.g. "1.2 hours"). This matches
// how annotators self-report and how billing periods are calculated.
export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '0.0 hours'
  return `${(seconds / 3600).toFixed(1)} hours`
}
