'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { AppShell } from '@/components/app-shell'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { compareFeedbackIds } from '@/lib/feedback-id'
import { cn } from '@/lib/utils'
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react'

interface BuilderItem {
  feedbackId: string
  activityId: string | null
  conjunctionId: string | null
  batch: { name: string } | null
}

interface RangeDraft {
  id: string
  startFeedbackId: string
  endFeedbackId: string
}

interface BatchBuilderPageProps {
  projectId: string
  projectName: string
  items: BuilderItem[]
}

function normalizeRangeValue(value: string) {
  return value.trim()
}

function createRangeDraft(): RangeDraft {
  return {
    id: crypto.randomUUID(),
    startFeedbackId: '',
    endFeedbackId: '',
  }
}

export function BatchBuilderPage({
  projectId,
  projectName,
  items,
}: BatchBuilderPageProps) {
  const router = useRouter()
  const [batchType, setBatchType] = useState<'REGULAR' | 'TRAINING'>('REGULAR')
  const [isDoubleScored, setIsDoubleScored] = useState(false)
  const [visibleToTeams, setVisibleToTeams] = useState(false)
  const [randomize, setRandomize] = useState(true)
  const [ranges, setRanges] = useState<RangeDraft[]>([createRangeDraft()])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => compareFeedbackIds(a.feedbackId, b.feedbackId)),
    [items]
  )
  const indexByFeedbackId = useMemo(
    () =>
      new Map(sortedItems.map((item, index) => [item.feedbackId.toLowerCase(), index])),
    [sortedItems]
  )

  const rangeSummaries = useMemo(() => {
    return ranges.map((range, index) => {
      const startFeedbackId = normalizeRangeValue(range.startFeedbackId)
      const endFeedbackId = normalizeRangeValue(range.endFeedbackId)

      if (!startFeedbackId || !endFeedbackId) {
        return {
          key: index,
          itemCount: 0,
          error: '',
          blockedCount: 0,
        }
      }

      const startIndex = indexByFeedbackId.get(startFeedbackId.toLowerCase())
      const endIndex = indexByFeedbackId.get(endFeedbackId.toLowerCase())

      if (startIndex === undefined || endIndex === undefined) {
        return {
          key: index,
          itemCount: 0,
          error: 'Both feedback IDs must exist in the project.',
          blockedCount: 0,
        }
      }

      if (startIndex > endIndex) {
        return {
          key: index,
          itemCount: 0,
          error: 'Start ID must come before end ID.',
          blockedCount: 0,
        }
      }

      const slice = sortedItems.slice(startIndex, endIndex + 1)
      const blockedCount = slice.filter((item) => item.batch !== null).length

      return {
        key: index,
        itemCount: slice.length,
        error: '',
        blockedCount,
      }
    })
  }, [indexByFeedbackId, ranges, sortedItems])

  const overlapError = useMemo(() => {
    const intervals = ranges
      .map((range, index) => {
        const startIndex = indexByFeedbackId.get(
          normalizeRangeValue(range.startFeedbackId).toLowerCase()
        )
        const endIndex = indexByFeedbackId.get(
          normalizeRangeValue(range.endFeedbackId).toLowerCase()
        )
        if (startIndex === undefined || endIndex === undefined) return null
        if (startIndex > endIndex) return null
        return { index, startIndex, endIndex }
      })
      .filter(Boolean) as { index: number; startIndex: number; endIndex: number }[]

    intervals.sort((a, b) => a.startIndex - b.startIndex)
    for (let i = 1; i < intervals.length; i++) {
      if (intervals[i].startIndex <= intervals[i - 1].endIndex) {
        return 'Feedback ID ranges cannot overlap.'
      }
    }
    return ''
  }, [indexByFeedbackId, ranges])

  const totalSelectedItems = rangeSummaries.reduce(
    (sum, summary) => sum + summary.itemCount,
    0
  )
  const totalBlockedItems = rangeSummaries.reduce(
    (sum, summary) => sum + summary.blockedCount,
    0
  )
  const hasRangeError =
    Boolean(overlapError) ||
    rangeSummaries.some((summary) => summary.error || summary.blockedCount > 0)

  async function handleCreateBatch(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSaving(true)

    try {
      const response = await fetch(`/api/projects/${projectId}/batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: batchType,
          isDoubleScored: batchType === 'REGULAR' ? isDoubleScored : false,
          visibleToTeams: batchType === 'REGULAR' ? visibleToTeams : false,
          randomize,
          ranges: ranges.map((range) => ({
            startFeedbackId: normalizeRangeValue(range.startFeedbackId),
            endFeedbackId: normalizeRangeValue(range.endFeedbackId),
          })),
        }),
      })

      if (!response.ok) {
        const payload = await response.json()
        setError(payload.error || 'Failed to create batch')
        return
      }

      router.push(`/admin/${projectId}?tab=batches`)
      router.refresh()
    } catch (caughtError) {
      console.error('Failed to create batch:', caughtError)
      setError('Something went wrong while creating the batch.')
    } finally {
      setSaving(false)
    }
  }

  function updateRange(index: number, field: keyof RangeDraft, value: string) {
    setRanges((previous) =>
      previous.map((range, rangeIndex) =>
        rangeIndex === index ? { ...range, [field]: value } : range
      )
    )
  }

  return (
    <AppShell
      projectContext={{
        id: projectId,
        name: projectName,
        activeTab: 'batches',
        onTabChange: (tab) => {
          router.push(`/admin/${projectId}?tab=${tab}`)
        },
      }}
    >
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <Link
              href={`/admin/${projectId}?tab=batches`}
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'mb-3')}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to Batches
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">Create Batch</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Build a batch from feedback ID ranges on the project&apos;s master list.
              These ranges are admin-only and will not be shown to annotators.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
            <div className="font-medium">{sortedItems.length} feedback IDs</div>
            <div className="text-muted-foreground">
              {sortedItems.filter((item) => item.batch === null).length} still unbatched
            </div>
          </div>
        </div>

        <form onSubmit={handleCreateBatch} className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle>Batch Setup</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
                <div className="font-medium">Batch names are automatic</div>
                <p className="mt-1 text-muted-foreground">
                  New batches are numbered deterministically. No manual batch naming.
                </p>
              </div>

              <div className="space-y-3">
                <Label>Batch Type</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={batchType === 'REGULAR' ? 'default' : 'outline'}
                    onClick={() => setBatchType('REGULAR')}
                  >
                    Regular
                  </Button>
                  <Button
                    type="button"
                    variant={batchType === 'TRAINING' ? 'default' : 'outline'}
                    onClick={() => setBatchType('TRAINING')}
                  >
                    Training
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Regular batches follow team assignment rules. Training batches stay
                  available for the existing evaluator-based training flow.
                </p>
              </div>

              {batchType === 'REGULAR' && (
                <div className="space-y-3">
                  <label className="flex items-start gap-3 rounded-xl border border-border p-4 text-sm">
                    <input
                      type="checkbox"
                      checked={isDoubleScored}
                      onChange={(event) => setIsDoubleScored(event.target.checked)}
                      className="mt-1 rounded border-input"
                    />
                    <div>
                      <div className="font-medium">Double scored</div>
                      <p className="text-muted-foreground">
                        When enabled, both members of each team score the same items
                        for that team&apos;s criteria. When disabled, items are
                        randomized and split evenly between the two teammates.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 rounded-xl border border-border p-4 text-sm">
                    <input
                      type="checkbox"
                      checked={visibleToTeams}
                      onChange={(event) => setVisibleToTeams(event.target.checked)}
                      className="mt-1 rounded border-input"
                    />
                    <div>
                      <div className="font-medium">Make visible to all teams immediately</div>
                      <p className="text-muted-foreground">
                        Every project team will be assigned this batch automatically.
                        Leave this off to keep all team assignments hidden until you
                        release them later.
                      </p>
                    </div>
                  </label>
                </div>
              )}

              <label className="flex items-start gap-3 rounded-xl border border-border p-4 text-sm">
                <input
                  type="checkbox"
                  checked={randomize}
                  onChange={(event) => setRandomize(event.target.checked)}
                  className="mt-1 rounded border-input"
                />
                <div>
                  <div className="font-medium">Randomize display order</div>
                  <p className="text-muted-foreground">
                    Shuffle the items within the batch after creation so AI and human
                    feedback stay mixed during scoring.
                  </p>
                </div>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Range Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
                <span>Selected items</span>
                <span className="font-semibold">{totalSelectedItems}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
                <span>Blocked by existing batches</span>
                <span className="font-semibold">{totalBlockedItems}</span>
              </div>
              {overlapError && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-destructive">
                  {overlapError}
                </div>
              )}
              <div className="rounded-xl border border-border px-4 py-3">
                <div className="font-medium">Ordering assumption</div>
                <p className="mt-1 text-muted-foreground">
                  Feedback IDs are ordered by the stable project master list, for
                  example `F001` through `F050`.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Feedback ID Ranges</CardTitle>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setRanges((previous) => [
                    ...previous,
                    createRangeDraft(),
                  ])
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Range
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {ranges.map((range, index) => {
                const summary = rangeSummaries[index]
                return (
                  <div
                    key={range.id}
                    className="rounded-2xl border border-border p-4"
                  >
                    <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
                      <div className="space-y-2">
                        <Label htmlFor={`range-start-${index}`}>Start Feedback ID</Label>
                        <Input
                          id={`range-start-${index}`}
                          value={range.startFeedbackId}
                          onChange={(event) =>
                            updateRange(index, 'startFeedbackId', event.target.value)
                          }
                          placeholder="F001"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`range-end-${index}`}>End Feedback ID</Label>
                        <Input
                          id={`range-end-${index}`}
                          value={range.endFeedbackId}
                          onChange={(event) =>
                            updateRange(index, 'endFeedbackId', event.target.value)
                          }
                          placeholder="F050"
                        />
                      </div>
                      <div className="flex items-end justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() =>
                            setRanges((previous) =>
                              previous.length === 1
                                ? previous
                                : previous.filter((candidate) => candidate.id !== range.id)
                            )
                          }
                          disabled={ranges.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="outline">
                        {summary.itemCount} item{summary.itemCount === 1 ? '' : 's'}
                      </Badge>
                      {summary.blockedCount > 0 && (
                        <Badge className="bg-destructive/10 text-destructive">
                          {summary.blockedCount} already batched
                        </Badge>
                      )}
                      {summary.error && (
                        <span className="text-destructive">{summary.error}</span>
                      )}
                    </div>
                  </div>
                )
              })}

              {error && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Link
                  href={`/admin/${projectId}?tab=batches`}
                  className={buttonVariants({ variant: 'outline' })}
                >
                  Cancel
                </Link>
                <Button
                  type="submit"
                  disabled={saving || totalSelectedItems === 0 || hasRangeError}
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    `Create Batch (${totalSelectedItems} items)`
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </AppShell>
  )
}
