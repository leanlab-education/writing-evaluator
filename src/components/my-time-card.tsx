'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDuration, type Period } from '@/lib/activity-tracker-config'

interface PeriodTotals {
  annotationSeconds: number
  otherSeconds: number
}

// Self-view of measured platform time, hidden by default. Surfaces only when
// NEXT_PUBLIC_SHOW_ANNOTATOR_TIME === 'true' so we can flip it for annotators
// later without a code change.
export function MyTimeCard() {
  const enabled = process.env.NEXT_PUBLIC_SHOW_ANNOTATOR_TIME === 'true'
  const [period, setPeriod] = useState<Period>('month')
  const [data, setData] = useState<PeriodTotals | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    fetch(`/api/my-time?period=${period}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json: PeriodTotals | null) => {
        if (!cancelled && json) setData(json)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [enabled, period])

  if (!enabled) return null

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium">Your platform time</CardTitle>
        <div className="flex items-center gap-1 rounded-md border border-border bg-background p-0.5 text-xs">
          {(['week', 'month', 'all'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-2 py-0.5 rounded transition-colors ${
                period === p
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p === 'week' ? 'Week' : p === 'month' ? 'Month' : 'All'}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-4 pt-0">
        <div>
          <p className="text-xs text-muted-foreground">Annotating</p>
          <p className="text-lg font-semibold tabular-nums">
            {formatDuration(data?.annotationSeconds ?? 0)}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Other</p>
          <p className="text-lg font-semibold tabular-nums">
            {formatDuration(data?.otherSeconds ?? 0)}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
