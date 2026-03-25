'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
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
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Clock,
  Loader2,
  AlertTriangle,
  ArrowLeft,
} from 'lucide-react'
import { NavHeader } from '@/components/nav-header'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RubricDimension {
  id: string
  key: string
  label: string
  description: string | null
  sortOrder: number
  scaleMin: number
  scaleMax: number
  scoreLabelJson: string | null
}

interface FeedbackItem {
  id: string
  activityId: string | null
  conjunctionId: string | null
  studentText: string
  feedbackText: string
  displayOrder: number | null
}

interface ProjectData {
  id: string
  name: string
  rubric: RubricDimension[]
}

interface DimensionScore {
  dimensionId: string
  value: number | null
}

interface ItemScoreState {
  scores: DimensionScore[]
  notes: string
  startedAt: string | null
  saved: boolean
}

interface ExistingScore {
  feedbackItemId: string
  dimensionId: string
  value: number
  notes: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// Build a windowed list of indices + ellipsis markers for navigation
// e.g. [0, '...', 44, 45, 46, 47, 48, '...', 2099]
function buildNavWindow(
  current: number,
  total: number,
  wing: number
): (number | '...')[] {
  if (total <= wing * 2 + 3) {
    return Array.from({ length: total }, (_, i) => i)
  }
  const result: (number | '...')[] = []
  const start = Math.max(1, current - wing)
  const end = Math.min(total - 2, current + wing)

  result.push(0)
  if (start > 1) result.push('...')
  for (let i = start; i <= end; i++) result.push(i)
  if (end < total - 2) result.push('...')
  result.push(total - 1)

  return result
}

function getScoreColor(value: number, min: number, max: number): string {
  if (max === min)
    return 'border-score-mid-border bg-score-mid-bg text-score-mid-text'
  const ratio = (value - min) / (max - min)
  if (ratio <= 0.25)
    return 'border-score-low-border bg-score-low-bg text-score-low-text'
  if (ratio < 0.75)
    return 'border-score-mid-border bg-score-mid-bg text-score-mid-text'
  return 'border-score-high-border bg-score-high-bg text-score-high-text'
}

function getSelectedScoreColor(
  value: number,
  min: number,
  max: number
): string {
  if (max === min)
    return 'bg-score-mid-solid text-white border-score-mid-solid'
  const ratio = (value - min) / (max - min)
  if (ratio <= 0.25)
    return 'bg-score-low-solid text-white border-score-low-solid'
  if (ratio < 0.75)
    return 'bg-score-mid-solid text-white border-score-mid-solid'
  return 'bg-score-high-solid text-white border-score-high-solid'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EvaluateClient({
  projectId,
  userName,
  batchId,
}: {
  projectId: string
  userName: string
  batchId?: string
}) {
  const router = useRouter()

  // Data
  const [project, setProject] = useState<ProjectData | null>(null)
  const [items, setItems] = useState<FeedbackItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Navigation
  const [currentIndex, setCurrentIndex] = useState(0)

  // Per-item scoring state, keyed by feedbackItem id
  const [itemScores, setItemScores] = useState<Record<string, ItemScoreState>>(
    {}
  )

  // UI & saving
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')

  // Timing
  const interactedRef = useRef(false)

  // Auto-save
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastSavedRef = useRef<string>('') // JSON snapshot to detect changes
  const saveInProgressRef = useRef(false) // prevent concurrent saves

  // ---------------------------------------------------------------------------
  // Fetch data
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const itemsUrl = batchId
        ? `/api/feedback-items?projectId=${projectId}&batchId=${batchId}`
        : `/api/feedback-items?projectId=${projectId}`

      const [projectRes, itemsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(itemsUrl),
      ])

      if (!projectRes.ok) {
        throw new Error(
          `Failed to load project: ${projectRes.status} ${projectRes.statusText}`
        )
      }
      if (!itemsRes.ok) {
        throw new Error(
          `Failed to load feedback items: ${itemsRes.status} ${itemsRes.statusText}`
        )
      }

      const projectData: ProjectData = await projectRes.json()
      const itemsData: FeedbackItem[] = await itemsRes.json()

      // Sort rubric by sortOrder
      projectData.rubric.sort((a, b) => a.sortOrder - b.sortOrder)

      // Sort items by displayOrder (nulls last), then by id for stable ordering
      itemsData.sort((a, b) => {
        const aOrd = a.displayOrder ?? Number.MAX_SAFE_INTEGER
        const bOrd = b.displayOrder ?? Number.MAX_SAFE_INTEGER
        if (aOrd !== bOrd) return aOrd - bOrd
        return a.id.localeCompare(b.id)
      })

      setProject(projectData)
      setItems(itemsData)

      // Initialize score state for each item
      const initialScores: Record<string, ItemScoreState> = {}
      for (const item of itemsData) {
        initialScores[item.id] = {
          scores: projectData.rubric.map((dim) => ({
            dimensionId: dim.id,
            value: null,
          })),
          notes: '',
          startedAt: null,
          saved: false,
        }
      }

      // Load any existing scores from the server (flat array of Score records)
      try {
        const existingRes = await fetch(
          `/api/scores?projectId=${projectId}`
        )
        if (existingRes.ok) {
          const existingScores: ExistingScore[] = await existingRes.json()

          for (const existing of existingScores) {
            const state = initialScores[existing.feedbackItemId]
            if (!state) continue
            const dimScore = state.scores.find(
              (s) => s.dimensionId === existing.dimensionId
            )
            if (dimScore) {
              dimScore.value = existing.value
            }
            if (existing.notes && !state.notes) {
              state.notes = existing.notes
            }
          }

          // Mark items as saved if all dimensions have values
          for (const state of Object.values(initialScores)) {
            if (state.scores.every((s) => s.value !== null)) {
              state.saved = true
            }
          }
        }
      } catch {
        // Non-critical — just means we start fresh
      }

      setItemScores(initialScores)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [projectId, batchId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ---------------------------------------------------------------------------
  // Reset interaction timer when navigating items
  // ---------------------------------------------------------------------------

  useEffect(() => {
    interactedRef.current = false
  }, [currentIndex])

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const currentItem = items[currentIndex] ?? null
  const currentScoreState = currentItem ? itemScores[currentItem.id] : null
  const scoredCount = Object.values(itemScores).filter((s) => s.saved).length
  const totalCount = items.length
  const allComplete = totalCount > 0 && scoredCount === totalCount
  const progressPercent = totalCount > 0 ? (scoredCount / totalCount) * 100 : 0

  const allDimensionsScored =
    currentScoreState?.scores.every((s) => s.value !== null) ?? false

  // ---------------------------------------------------------------------------
  // Auto-save: debounced 1s after any score or notes change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!currentItem || !currentScoreState) return

    // Build a snapshot of the current state
    const snapshot = JSON.stringify({
      scores: currentScoreState.scores,
      notes: currentScoreState.notes,
    })

    // Skip if nothing changed or no scores set yet
    const hasAnyScore = currentScoreState.scores.some((s) => s.value !== null)
    if (!hasAnyScore || snapshot === lastSavedRef.current) return

    // Clear any pending timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    setSaveStatus('idle')

    autoSaveTimerRef.current = setTimeout(async () => {
      if (saveInProgressRef.current) return
      saveInProgressRef.current = true
      setSaveStatus('saving')
      try {
        const scoresToSave = currentScoreState.scores
          .filter((s) => s.value !== null)
          .map((s) => ({ dimensionId: s.dimensionId, value: s.value! }))

        const res = await fetch('/api/scores', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            feedbackItemId: currentItem.id,
            scores: scoresToSave,
            notes: currentScoreState.notes || undefined,
            startedAt: currentScoreState.startedAt || undefined,
          }),
        })

        if (res.ok) {
          lastSavedRef.current = snapshot
          setSaveStatus('saved')
        } else {
          setSaveStatus('error')
        }
      } catch {
        setSaveStatus('error')
      } finally {
        saveInProgressRef.current = false
      }
    }, 1000)

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [currentItem, currentScoreState])

  // Reset save status when navigating to a new item
  useEffect(() => {
    setSaveStatus('idle')
    lastSavedRef.current = ''
  }, [currentIndex])

  // ---------------------------------------------------------------------------
  // Score handlers
  // ---------------------------------------------------------------------------

  function handleScoreChange(dimensionId: string, value: number) {
    if (!currentItem) return

    // Mark first interaction time
    if (!interactedRef.current) {
      interactedRef.current = true
      setItemScores((prev) => ({
        ...prev,
        [currentItem.id]: {
          ...prev[currentItem.id],
          startedAt: prev[currentItem.id].startedAt ?? new Date().toISOString(),
        },
      }))
    }

    setItemScores((prev) => ({
      ...prev,
      [currentItem.id]: {
        ...prev[currentItem.id],
        saved: false,
        scores: prev[currentItem.id].scores.map((s) =>
          s.dimensionId === dimensionId ? { ...s, value } : s
        ),
      },
    }))
  }

  function handleNotesChange(notes: string) {
    if (!currentItem) return
    setItemScores((prev) => ({
      ...prev,
      [currentItem.id]: {
        ...prev[currentItem.id],
        notes,
      },
    }))
  }

  // ---------------------------------------------------------------------------
  // Save & Continue
  // ---------------------------------------------------------------------------

  async function handleContinue() {
    if (!currentItem || !currentScoreState || !allDimensionsScored) return

    // Cancel any pending auto-save
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }

    // Wait for any in-progress auto-save to complete
    if (saveInProgressRef.current) return

    setSaving(true)
    saveInProgressRef.current = true
    try {
      const startedAt = currentScoreState.startedAt ?? new Date().toISOString()
      const durationSeconds = Math.round(
        (Date.now() - new Date(startedAt).getTime()) / 1000
      )

      // Force-save via PUT (upsert) with timing data
      const res = await fetch('/api/scores', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedbackItemId: currentItem.id,
          scores: currentScoreState.scores
            .filter((s) => s.value !== null)
            .map((s) => ({
              dimensionId: s.dimensionId,
              value: s.value!,
            })),
          notes: currentScoreState.notes || undefined,
          startedAt,
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Save failed: ${errText}`)
      }

      // Mark saved
      setItemScores((prev) => ({
        ...prev,
        [currentItem.id]: {
          ...prev[currentItem.id],
          saved: true,
        },
      }))

      setSaveStatus('saved')

      // Auto-advance to next unscored item
      const nextUnscoredIndex = items.findIndex(
        (item, i) => i > currentIndex && !itemScores[item.id]?.saved
      )
      if (nextUnscoredIndex !== -1) {
        setCurrentIndex(nextUnscoredIndex)
      } else if (currentIndex < items.length - 1) {
        setCurrentIndex(currentIndex + 1)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save scores')
    } finally {
      setSaving(false)
      saveInProgressRef.current = false
    }
  }

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading evaluation...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" />
              Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => {
                setError(null)
                fetchData()
              }}
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!project || items.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>No Items to Evaluate</CardTitle>
            <CardDescription>
              There are no feedback items assigned to you for this project.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => router.push('/')}>
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Completion screen
  // ---------------------------------------------------------------------------

  if (allComplete) {
    return (
      <div className="min-h-screen bg-background">
        <NavHeader />
        <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center">
          <Card className="max-w-lg text-center">
            <CardHeader>
              <div className="mx-auto mb-2 flex size-16 items-center justify-center rounded-full bg-success/10">
                <CheckCircle className="size-8 text-success" />
              </div>
              <CardTitle className="text-xl">All Items Scored!</CardTitle>
              <CardDescription>
                You have completed scoring all {totalCount} feedback items for{' '}
                <span className="font-medium text-foreground">
                  {project.name}
                </span>
                .
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button
                variant="outline"
                onClick={() => setCurrentIndex(0)}
              >
                Review Scores
              </Button>
              <Button onClick={() => router.push('/')}>
                Return to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Main scoring interface
  // ---------------------------------------------------------------------------

  const rubric = project.rubric

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <NavHeader />

      {/* Evaluation sub-header */}
      <header className="sticky top-14 z-10 border-b bg-background/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-7xl flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => router.push('/')}
                title="Back to Dashboard"
              >
                <ArrowLeft className="size-4" />
              </Button>
              <h1 className="text-lg font-semibold text-foreground">
                {project.name}
              </h1>
            </div>
            <Badge variant="secondary">{userName}</Badge>
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">
              {scoredCount} / {totalCount} scored
            </span>
            <div className="flex-1">
              <Progress value={progressPercent} />
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((i) => i - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>

            <div className="flex flex-1 items-center justify-center gap-1">
              {buildNavWindow(currentIndex, items.length, 5).map((entry, i) =>
                entry === '...' ? (
                  <span key={`ellipsis-${i}`} className="px-1 text-sm text-muted-foreground">…</span>
                ) : (
                  <button
                    key={entry}
                    onClick={() => setCurrentIndex(entry as number)}
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium transition-all duration-200 ${
                      entry === currentIndex
                        ? 'bg-nav-current-bg text-nav-current-text ring-2 ring-nav-current-ring'
                        : itemScores[items[entry as number]?.id]?.saved
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

      {/* Split pane: left (content) + right (rubric) */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 gap-6 p-4 lg:p-6">
        {/* Left column: activity + student response + feedback */}
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

        {/* Right column: rubric scoring */}
        <div className="flex w-full flex-col gap-4 lg:w-1/2">
          <Card>
            <CardHeader>
              <CardTitle>Score This Feedback</CardTitle>
              <CardDescription>
                Rate each dimension below. All dimensions must be scored before
                continuing.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {rubric.map((dim) => {
                const scoreLabels = parseScoreLabels(dim.scoreLabelJson)
                const currentValue =
                  currentScoreState?.scores.find(
                    (s) => s.dimensionId === dim.id
                  )?.value ?? null

                const scaleOptions: number[] = []
                for (let v = dim.scaleMin; v <= dim.scaleMax; v++) {
                  scaleOptions.push(v)
                }

                return (
                  <div key={dim.id} className="flex flex-col gap-2">
                    <div>
                      <Label className="text-sm font-semibold text-foreground">
                        {dim.label}
                      </Label>
                      {dim.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {dim.description}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {scaleOptions.map((val) => {
                        const label = scoreLabels[val]
                        const isSelected = currentValue === val
                        return (
                          <button
                            key={val}
                            onClick={() => handleScoreChange(dim.id, val)}
                            className={`flex flex-col items-center rounded-xl border-2 px-3 py-2 text-center transition-all duration-200 ${
                              isSelected
                                ? getSelectedScoreColor(
                                    val,
                                    dim.scaleMin,
                                    dim.scaleMax
                                  )
                                : `${getScoreColor(val, dim.scaleMin, dim.scaleMax)} hover:shadow-md`
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

                    {currentValue !== null && scoreLabels[currentValue] && (
                      <p className="text-xs italic text-muted-foreground">
                        {scoreLabels[currentValue].description}
                      </p>
                    )}

                  </div>
                )
              })}

              {/* Notes */}
              <div className="border-t pt-4">
                <Label className="text-sm font-semibold text-foreground">
                  Notes (optional)
                </Label>
                <Textarea
                  placeholder="Any additional notes about this feedback item..."
                  value={currentScoreState?.notes ?? ''}
                  onChange={(e) => handleNotesChange(e.target.value)}
                  className="mt-2 text-sm"
                  rows={3}
                />
              </div>

              {/* Save status + timing indicator */}
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
                {currentScoreState?.startedAt && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="size-3" />
                    <span>
                      Started{' '}
                      {new Date(
                        currentScoreState.startedAt
                      ).toLocaleTimeString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Continue button */}
              <Button
                className="w-full"
                size="lg"
                disabled={!allDimensionsScored || saving}
                onClick={handleContinue}
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving...
                  </>
                ) : currentScoreState?.saved ? (
                  <>
                    <CheckCircle className="size-4" />
                    Update & Continue
                  </>
                ) : (
                  'Continue'
                )}
              </Button>

              {!allDimensionsScored && (
                <p className="text-center text-xs text-muted-foreground">
                  Score all {rubric.length} dimensions to continue
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
