'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Loader2,
  AlertTriangle,
  ArrowLeft,
  Scale,
} from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import {
  buildNavWindow,
  getScoreColor,
  getSelectedScoreColor,
} from '@/lib/scoring-utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvaluatorScore {
  userId: string
  name: string | null
  email: string
  value: number
  scoreId: string
}

interface Discrepancy {
  dimensionId: string
  dimensionLabel: string
  dimensionKey: string
  sortOrder: number
  scaleMin: number
  scaleMax: number
  scoreLabelJson: string | null
  evaluatorA: EvaluatorScore
  evaluatorB: EvaluatorScore
}

interface Agreement {
  dimensionId: string
  dimensionLabel: string
  value: number
}

interface DiscrepantItem {
  feedbackItemId: string
  studentText: string
  feedbackText: string
  activityId: string | null
  conjunctionId: string | null
  displayOrder: number | null
  discrepancies: Discrepancy[]
  agreements: Agreement[]
}

interface DiscrepancyResponse {
  items: DiscrepantItem[]
  summary: {
    totalItems: number
    discrepantItems: number
    totalDiscrepancies: number
    totalDimensionPairs: number
    reconciledCount: number
  }
}

// Per-item reconciliation state
interface ItemReconcileState {
  scores: Record<string, number | null> // dimensionId → final value
  notes: string
  saved: boolean
}

function parseScoreLabels(
  json: string | null
): Record<number, { label: string; description?: string }> {
  if (!json) return {}
  try {
    return JSON.parse(json)
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReconcileClient({
  projectId,
  batchId,
  batchName,
  userName,
}: {
  projectId: string
  batchId: string
  batchName: string
  userName: string
}) {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<DiscrepantItem[]>([])
  const [summary, setSummary] = useState<DiscrepancyResponse['summary'] | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [itemStates, setItemStates] = useState<Record<string, ItemReconcileState>>({})
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // Fetch discrepancies on mount
  useEffect(() => {
    async function fetchDiscrepancies() {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/batches/${batchId}/discrepancies`
        )
        if (!res.ok) throw new Error('Failed to fetch discrepancies')
        const data: DiscrepancyResponse = await res.json()
        setItems(data.items)
        setSummary(data.summary)

        // Initialize state for each item - pre-fill agreed dimensions
        const states: Record<string, ItemReconcileState> = {}
        for (const item of data.items) {
          const scores: Record<string, number | null> = {}
          // Agreed dimensions are auto-filled
          for (const a of item.agreements) {
            scores[a.dimensionId] = a.value
          }
          // Discrepant dimensions start empty
          for (const d of item.discrepancies) {
            scores[d.dimensionId] = null
          }
          states[item.feedbackItemId] = { scores, notes: '', saved: false }
        }
        setItemStates(states)
      } catch (err) {
        console.error('Failed to load discrepancies:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchDiscrepancies()
  }, [projectId, batchId])

  const currentItem = items[currentIndex] ?? null
  const currentState = currentItem ? itemStates[currentItem.feedbackItemId] : null

  // Check if all discrepant dimensions have a final value
  const allDiscrepanciesScored = currentItem
    ? currentItem.discrepancies.every(
        (d) => currentState?.scores[d.dimensionId] != null
      )
    : false

  const resolvedCount = Object.values(itemStates).filter((s) => s.saved).length

  const handleFinalScoreChange = useCallback(
    (dimensionId: string, value: number) => {
      if (!currentItem) return
      setItemStates((prev) => ({
        ...prev,
        [currentItem.feedbackItemId]: {
          ...prev[currentItem.feedbackItemId],
          scores: {
            ...prev[currentItem.feedbackItemId].scores,
            [dimensionId]: value,
          },
        },
      }))
      setSaveStatus('idle')
    },
    [currentItem]
  )

  const handleNotesChange = useCallback(
    (notes: string) => {
      if (!currentItem) return
      setItemStates((prev) => ({
        ...prev,
        [currentItem.feedbackItemId]: {
          ...prev[currentItem.feedbackItemId],
          notes,
        },
      }))
    },
    [currentItem]
  )

  const handleSaveAndContinue = useCallback(async () => {
    if (!currentItem || !currentState || !allDiscrepanciesScored) return

    setSaving(true)
    setSaveStatus('saving')

    try {
      // Build scores array: all dimensions (agreed + discrepant)
      const scores = Object.entries(currentState.scores)
        .filter(([, v]) => v != null)
        .map(([dimensionId, value]) => ({ dimensionId, value: value! }))

      const res = await fetch(
        `/api/projects/${projectId}/batches/${batchId}/reconcile`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: [
              {
                feedbackItemId: currentItem.feedbackItemId,
                scores,
                notes: currentState.notes || undefined,
              },
            ],
          }),
        }
      )

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save')
      }

      // Mark as saved
      setItemStates((prev) => ({
        ...prev,
        [currentItem.feedbackItemId]: {
          ...prev[currentItem.feedbackItemId],
          saved: true,
        },
      }))
      setSaveStatus('saved')

      // Advance to next unresolved item
      const nextUnresolved = items.findIndex(
        (item, i) =>
          i > currentIndex && !itemStates[item.feedbackItemId]?.saved
      )
      if (nextUnresolved !== -1) {
        setTimeout(() => setCurrentIndex(nextUnresolved), 300)
      }
    } catch (err) {
      console.error('Save failed:', err)
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }, [currentItem, currentState, allDiscrepanciesScored, projectId, batchId, items, currentIndex, itemStates])

  // Loading state
  if (loading) {
    return (
      <AppShell defaultCollapsed>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    )
  }

  // No discrepancies - all scores matched
  if (items.length === 0) {
    return (
      <AppShell defaultCollapsed>
        <div className="mx-auto flex max-w-lg flex-col items-center justify-center gap-4 py-20 text-center">
          <CheckCircle className="size-16 text-success" />
          <h2 className="text-xl font-semibold">No Discrepancies Found</h2>
          <p className="text-sm text-muted-foreground">
            All scores in this batch match between evaluators. No reconciliation needed.
          </p>
          <Button onClick={() => router.push('/')}>Return to Dashboard</Button>
        </div>
      </AppShell>
    )
  }

  // All resolved
  if (resolvedCount === items.length) {
    return (
      <AppShell defaultCollapsed>
        <div className="mx-auto flex max-w-lg flex-col items-center justify-center gap-4 py-20 text-center">
          <CheckCircle className="size-16 text-success" />
          <h2 className="text-xl font-semibold">Reconciliation Complete</h2>
          <p className="text-sm text-muted-foreground">
            All {items.length} discrepant items have been reconciled.
            {summary && (
              <> ({summary.totalDiscrepancies} discrepancies resolved)</>
            )}
          </p>
          <Button onClick={() => router.push('/')}>Return to Dashboard</Button>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell defaultCollapsed>
      {/* Sticky header with navigation */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 px-4 py-3 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-3">
          {/* Top row: back + project info + progress */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/')}
              >
                <ArrowLeft className="mr-1 size-4" />
                Dashboard
              </Button>
              <span className="text-sm font-medium">{batchName}</span>
              <Badge
                variant="outline"
                className="bg-status-reconciliation-bg text-status-reconciliation-text"
              >
                Reconciling
              </Badge>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Scale className="size-3.5" />
              <span>
                {resolvedCount} of {items.length} items reconciled
              </span>
            </div>
          </div>

          {/* Navigation circles */}
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((i) => i - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>

            <div className="flex gap-1">
              {buildNavWindow(currentIndex, items.length, 5).map((entry, i) =>
                entry === '...' ? (
                  <span key={`ellipsis-${i}`} className="px-1 text-xs text-muted-foreground">
                    ...
                  </span>
                ) : (
                  <button
                    key={entry}
                    onClick={() => setCurrentIndex(entry as number)}
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-all duration-200 ${
                      entry === currentIndex
                        ? 'bg-nav-current-bg text-nav-current-text ring-2 ring-nav-current-ring'
                        : itemStates[items[entry as number]?.feedbackItemId]?.saved
                          ? 'bg-nav-scored-bg text-nav-scored-text'
                          : 'bg-nav-unscored-bg text-nav-unscored-text hover:opacity-80'
                    }`}
                  >
                    {(entry as number) + 1}
                  </button>
                )
              )}
            </div>

            <Button
              variant="outline"
              size="icon-sm"
              disabled={currentIndex === items.length - 1}
              onClick={() => setCurrentIndex((i) => i + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Split pane: left (content) + right (reconciliation) */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 gap-6 p-4 lg:p-6">
        {/* Left column: student response + feedback */}
        <div className="flex w-full flex-col gap-4 lg:w-1/2">
          {currentItem?.activityId && (
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Activity</CardDescription>
                <CardTitle className="text-base">
                  Activity {currentItem.activityId}
                  {currentItem.conjunctionId && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      ({currentItem.conjunctionId})
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
            </Card>
          )}

          <Card className="border-content-student-border bg-content-student-bg">
            <CardHeader>
              <CardTitle className="text-content-student-text">Student Response</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-content-student-text/80">
                {currentItem?.studentText}
              </div>
            </CardContent>
          </Card>

          <Card className="border-content-feedback-border bg-content-feedback-bg">
            <CardHeader>
              <CardTitle className="text-content-feedback-text">
                Feedback to Evaluate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-content-feedback-text/80">
                {currentItem?.feedbackText}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Vertical divider on desktop */}
        <div className="hidden w-px self-stretch bg-border lg:block" />

        {/* Right column: reconciliation scoring */}
        <div className="flex w-full flex-col gap-4 lg:w-1/2">
          <Card>
            <CardHeader>
              <CardTitle>Reconcile Scores</CardTitle>
              <CardDescription>
                Review both evaluators&apos; scores and select the final agreed-upon value
                for each discrepant dimension.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {/* Discrepant dimensions - need manual resolution */}
              {currentItem?.discrepancies.map((disc) => {
                const scoreLabels = parseScoreLabels(disc.scoreLabelJson)
                const finalValue = currentState?.scores[disc.dimensionId] ?? null

                const scaleOptions: number[] = []
                for (let v = disc.scaleMin; v <= disc.scaleMax; v++) {
                  scaleOptions.push(v)
                }

                return (
                  <div key={disc.dimensionId} className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="size-3.5 text-warning" />
                      <Label className="text-sm font-semibold text-foreground">
                        {disc.dimensionLabel}
                      </Label>
                      <Badge variant="outline" className="text-[10px] bg-warning/10 text-warning border-warning/30">
                        Discrepancy
                      </Badge>
                    </div>

                    {/* Both evaluators' scores side by side */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-border bg-muted/50 p-3">
                        <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          {disc.evaluatorA.name || disc.evaluatorA.email}
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex size-8 items-center justify-center rounded-lg border-2 text-sm font-bold ${getScoreColor(
                              disc.evaluatorA.value,
                              disc.scaleMin,
                              disc.scaleMax
                            )}`}
                          >
                            {disc.evaluatorA.value}
                          </span>
                          {scoreLabels[disc.evaluatorA.value] && (
                            <span className="text-xs text-muted-foreground">
                              {scoreLabels[disc.evaluatorA.value].label}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="rounded-lg border border-border bg-muted/50 p-3">
                        <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          {disc.evaluatorB.name || disc.evaluatorB.email}
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex size-8 items-center justify-center rounded-lg border-2 text-sm font-bold ${getScoreColor(
                              disc.evaluatorB.value,
                              disc.scaleMin,
                              disc.scaleMax
                            )}`}
                          >
                            {disc.evaluatorB.value}
                          </span>
                          {scoreLabels[disc.evaluatorB.value] && (
                            <span className="text-xs text-muted-foreground">
                              {scoreLabels[disc.evaluatorB.value].label}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Final score selection */}
                    <div>
                      <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                        Final Score
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {scaleOptions.map((val) => {
                          const label = scoreLabels[val]
                          const isSelected = finalValue === val
                          return (
                            <button
                              key={val}
                              onClick={() =>
                                handleFinalScoreChange(disc.dimensionId, val)
                              }
                              className={`flex flex-col items-center rounded-xl border-2 px-3 py-2 text-center transition-all duration-200 ${
                                isSelected
                                  ? getSelectedScoreColor(
                                      val,
                                      disc.scaleMin,
                                      disc.scaleMax
                                    )
                                  : `${getScoreColor(val, disc.scaleMin, disc.scaleMax)} hover:shadow-md`
                              }`}
                            >
                              <span className="text-lg font-bold">{val}</span>
                              {label && (
                                <span className="mt-0.5 text-[10px] font-medium leading-tight">
                                  {label.label}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Agreed dimensions - read-only */}
              {currentItem && currentItem.agreements.length > 0 && (
                <div className="border-t pt-4">
                  <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Agreed Scores (no action needed)
                  </div>
                  <div className="flex flex-col gap-2">
                    {currentItem.agreements.map((a) => (
                      <div
                        key={a.dimensionId}
                        className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle className="size-3.5 text-success" />
                          <span className="text-sm">{a.dimensionLabel}</span>
                        </div>
                        <span className="text-sm font-semibold">{a.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="border-t pt-4">
                <Label className="text-sm font-semibold text-foreground">
                  Notes (optional)
                </Label>
                <Textarea
                  placeholder="Notes about this reconciliation decision..."
                  value={currentState?.notes ?? ''}
                  onChange={(e) => handleNotesChange(e.target.value)}
                  className="mt-2 text-sm"
                  rows={3}
                />
              </div>

              {/* Save status */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  {saveStatus === 'saving' && (
                    <>
                      <Loader2 className="size-3 animate-spin" />
                      <span>Saving...</span>
                    </>
                  )}
                  {saveStatus === 'saved' && (
                    <>
                      <CheckCircle className="size-3 text-success" />
                      <span>Saved</span>
                    </>
                  )}
                  {saveStatus === 'error' && (
                    <>
                      <AlertTriangle className="size-3 text-destructive" />
                      <span>Save failed</span>
                    </>
                  )}
                </div>
              </div>

              {/* Save & Continue button */}
              <Button
                onClick={handleSaveAndContinue}
                disabled={!allDiscrepanciesScored || saving || currentState?.saved}
                className="w-full"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Saving...
                  </>
                ) : currentState?.saved ? (
                  <>
                    <CheckCircle className="mr-2 size-4" />
                    Reconciled
                  </>
                ) : (
                  'Save & Continue'
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </AppShell>
  )
}
