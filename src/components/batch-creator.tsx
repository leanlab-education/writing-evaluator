'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Loader2, Plus, Shuffle } from 'lucide-react'
import { batchStatusColors, batchStatusLabels } from '@/lib/status-colors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UnbatchedGroup {
  activityId: string | null
  conjunctionId: string | null
  count: number
}

interface BatchEvaluator {
  id: string
  email: string
  name: string | null
  scoringRole?: string
}

interface BatchRow {
  id: string
  name: string
  activityId: string | null
  conjunctionId: string | null
  status: string
  size: number
  sortOrder: number
  itemCount: number
  scoredItemCount: number
  discrepancyCount?: number
  reconciledCount?: number
  irrPct?: number | null
  evaluators: BatchEvaluator[]
  type?: string
  adjudicatorId?: string | null
  isHidden?: boolean
}

interface EvaluatorOption {
  userId: string
  user: { id: string; name: string | null; email: string }
}

interface Props {
  projectId: string
  evaluators: EvaluatorOption[]
  batches: BatchRow[]
  onBatchesChange: () => void
  batchesLoading: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BatchCreator({
  projectId,
  evaluators,
  batches,
  onBatchesChange,
  batchesLoading,
}: Props) {
  // Create batch dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  // Create form state
  const [selectedActivity, setSelectedActivity] = useState<string>('')
  const [selectedConjunction, setSelectedConjunction] = useState<string>('')
  const [selectedImport, setSelectedImport] = useState<string>('')
  const [batchSize, setBatchSize] = useState('250')
  const [batchName, setBatchName] = useState('')
  const [randomize, setRandomize] = useState(true)
  const [batchType, setBatchType] = useState<'REGULAR' | 'TRAINING'>(
    'REGULAR'
  )

  // Import history (for the "From import" filter in the create dialog)
  const [imports, setImports] = useState<
    {
      id: string
      filename: string
      itemCount: number
      skippedCount: number
      unbatchedRemaining: number
      createdAt: string
    }[]
  >([])

  // Unbatched stats
  const [unbatchedStats, setUnbatchedStats] = useState<{
    totalUnbatched: number
    groups: UnbatchedGroup[]
  } | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  // Batch list filters
  const [filterActivity, setFilterActivity] = useState('')
  const [filterConjunction, setFilterConjunction] = useState('')

  // Batch assignment — per-batch selected evaluator (avoids dropdown state
  // leaking across tiles when multiple batches are open).
  const [assigningBatch, setAssigningBatch] = useState<string | null>(null)
  const [selectedEvaluatorByBatch, setSelectedEvaluatorByBatch] = useState<
    Record<string, string>
  >({})

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchUnbatchedStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const res = await fetch(
        `/api/projects/${projectId}/unbatched-stats`
      )
      if (res.ok) {
        const data = await res.json()
        setUnbatchedStats(data)
      }
    } catch (err) {
      console.error('Failed to fetch unbatched stats:', err)
    } finally {
      setStatsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchUnbatchedStats()
  }, [fetchUnbatchedStats])

  // Fetch import history so the create dialog can scope new batches to a
  // specific upload (rolling-upload workflow per Amber's 4/9 meeting).
  useEffect(() => {
    async function fetchImports() {
      try {
        const res = await fetch(`/api/projects/${projectId}/imports`)
        if (res.ok) {
          const data = await res.json()
          setImports(data)
        }
      } catch (err) {
        console.error('Failed to fetch imports:', err)
      }
    }
    fetchImports()
  }, [projectId])

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  // Unique activity IDs from unbatched items
  const activityIds = [
    ...new Set(
      (unbatchedStats?.groups || [])
        .map((g) => g.activityId)
        .filter(Boolean) as string[]
    ),
  ].sort()

  // Conjunction IDs filtered by selected activity
  const conjunctionIds = [
    ...new Set(
      (unbatchedStats?.groups || [])
        .filter((g) =>
          selectedActivity ? g.activityId === selectedActivity : true
        )
        .map((g) => g.conjunctionId)
        .filter(Boolean) as string[]
    ),
  ].sort()

  // Unique activity/conjunction IDs from existing batches (for list filters)
  const batchActivityIds = [
    ...new Set(
      batches.map((b) => b.activityId).filter(Boolean) as string[]
    ),
  ].sort()
  const batchConjunctionIds = [
    ...new Set(
      batches
        .filter((b) => (filterActivity ? b.activityId === filterActivity : true))
        .map((b) => b.conjunctionId)
        .filter(Boolean) as string[]
    ),
  ].sort()

  // Filtered batch list
  const filteredBatches = batches.filter((b) => {
    if (filterActivity && b.activityId !== filterActivity) return false
    if (filterConjunction && b.conjunctionId !== filterConjunction) return false
    return true
  })

  // Count of available items matching current filters
  const matchingCount =
    unbatchedStats?.groups
      .filter((g) => {
        if (selectedActivity && g.activityId !== selectedActivity) return false
        if (selectedConjunction && g.conjunctionId !== selectedConjunction)
          return false
        return true
      })
      .reduce((sum, g) => sum + g.count, 0) ?? 0

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function handleCreateBatch(e: React.FormEvent) {
    e.preventDefault()
    setCreateError('')
    setCreating(true)

    try {
      const res = await fetch(`/api/projects/${projectId}/batches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: batchName.trim() || undefined,
          activityId: selectedActivity || undefined,
          conjunctionId: selectedConjunction || undefined,
          importId: selectedImport || undefined,
          batchSize:
            batchSize === 'all' ? 'all' : parseInt(batchSize) || 250,
          type: batchType,
          randomize,
        }),
      })

      if (res.ok) {
        setBatchName('')
        setSelectedActivity('')
        setSelectedConjunction('')
        setSelectedImport('')
        setBatchSize('250')
        setRandomize(true)
        setBatchType('REGULAR')
        setCreateOpen(false)
        onBatchesChange()
        fetchUnbatchedStats()
      } else {
        const err = await res.json()
        setCreateError(err.error || 'Failed to create batch')
      }
    } catch (err) {
      console.error('Failed to create batch:', err)
      setCreateError('Something went wrong')
    } finally {
      setCreating(false)
    }
  }

  async function handleAssignEvaluator(batchId: string, userId: string) {
    // Auto-derive scoringRole from existing assignee count:
    //   0 existing -> PRIMARY (first scorer)
    //   1 existing -> DOUBLE  (second scorer = double-scored batch)
    // The dropdown-based role picker was confusing (per 2026-04-09 meeting);
    // this keeps the mental model simple: add one person = independent,
    // add a second = double-scored.
    const batch = batches.find((b) => b.id === batchId)
    const existingCount = batch?.evaluators.length ?? 0
    const scoringRole: 'PRIMARY' | 'DOUBLE' =
      existingCount === 0 ? 'PRIMARY' : 'DOUBLE'

    setAssigningBatch(batchId)
    try {
      const res = await fetch(
        `/api/projects/${projectId}/batches/${batchId}/assign`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userIds: [userId],
            scoringRole,
          }),
        }
      )
      if (res.ok) {
        onBatchesChange()
        setSelectedEvaluatorByBatch((prev) => {
          const next = { ...prev }
          delete next[batchId]
          return next
        })
      }
    } catch (err) {
      console.error('Failed to assign evaluator:', err)
    } finally {
      setAssigningBatch(null)
    }
  }

  async function handleRemoveEvaluator(batchId: string, userId: string) {
    setAssigningBatch(batchId)
    try {
      await fetch(
        `/api/projects/${projectId}/batches/${batchId}/assign?userId=${userId}`,
        { method: 'DELETE' }
      )
      onBatchesChange()
    } catch (err) {
      console.error('Failed to remove evaluator:', err)
    } finally {
      setAssigningBatch(null)
    }
  }

  async function handleBatchStatusChange(batchId: string, newStatus: string) {
    if (newStatus === 'COMPLETE' && !confirm('This will prevent evaluators from making further changes to this batch. Continue?')) {
      return
    }
    try {
      const res = await fetch(
        `/api/projects/${projectId}/batches/${batchId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        }
      )
      if (res.ok) {
        onBatchesChange()
      }
    } catch (err) {
      console.error('Failed to update batch status:', err)
    }
  }

  async function handleAdjudicatorChange(
    batchId: string,
    adjudicatorId: string | null
  ) {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/batches/${batchId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adjudicatorId }),
        }
      )
      if (res.ok) {
        onBatchesChange()
      }
    } catch (err) {
      console.error('Failed to update adjudicator:', err)
    }
  }

  async function handleVisibilityChange(batchId: string, isHidden: boolean) {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/batches/${batchId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isHidden }),
        }
      )
      if (res.ok) {
        onBatchesChange()
      }
    } catch (err) {
      console.error('Failed to update visibility:', err)
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Batches</h2>
          <p className="text-sm text-muted-foreground">
            Create batches by filtering items, then assign to evaluators.
            {unbatchedStats && (
              <span className="ml-1 font-medium">
                {unbatchedStats.totalUnbatched} unbatched items remaining.
              </span>
            )}
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-2 h-4 w-4" />
            Create Batch
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Batch</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateBatch} className="space-y-4">
              {/* Batch type */}
              <div className="space-y-2">
                <Label>Batch Type</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={batchType === 'REGULAR' ? 'default' : 'outline'}
                    onClick={() => setBatchType('REGULAR')}
                  >
                    Regular
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={
                      batchType === 'TRAINING' ? 'default' : 'outline'
                    }
                    onClick={() => setBatchType('TRAINING')}
                  >
                    Training
                  </Button>
                </div>
                {batchType === 'TRAINING' && (
                  <p className="text-xs text-muted-foreground">
                    All evaluators will score every rubric criterion for these
                    items. Use for initial onboarding before teams are assigned.
                  </p>
                )}
              </div>

              {/* Scope to a specific import (rolling upload workflow) */}
              {imports.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="import-filter">
                    From upload{' '}
                    <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <select
                    id="import-filter"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors"
                    value={selectedImport}
                    onChange={(e) => setSelectedImport(e.target.value)}
                  >
                    <option value="">All unbatched items</option>
                    {imports
                      .filter((imp) => imp.unbatchedRemaining > 0)
                      .map((imp) => (
                        <option key={imp.id} value={imp.id}>
                          {imp.filename} · {imp.unbatchedRemaining} unbatched ·{' '}
                          {new Date(imp.createdAt).toLocaleDateString()}
                        </option>
                      ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Pick a single upload if you only want to batch items from
                    that file.
                  </p>
                </div>
              )}

              {/* Activity filter */}
              <div className="space-y-2">
                <Label htmlFor="activity-filter">Activity ID</Label>
                <select
                  id="activity-filter"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors"
                  value={selectedActivity}
                  onChange={(e) => {
                    setSelectedActivity(e.target.value)
                    setSelectedConjunction('')
                  }}
                >
                  <option value="">All activities</option>
                  {activityIds.map((id) => (
                    <option key={id} value={id}>
                      Activity {id}
                    </option>
                  ))}
                </select>
              </div>

              {/* Conjunction filter */}
              <div className="space-y-2">
                <Label htmlFor="conjunction-filter">Conjunction ID</Label>
                <select
                  id="conjunction-filter"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors"
                  value={selectedConjunction}
                  onChange={(e) => setSelectedConjunction(e.target.value)}
                >
                  <option value="">All conjunctions</option>
                  {conjunctionIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </div>

              {/* Available items */}
              <div className="rounded-md bg-muted px-3 py-2 text-sm">
                <span className="font-medium">{matchingCount}</span> items
                available matching these filters
              </div>

              {/* Batch size */}
              <div className="space-y-2">
                <Label htmlFor="batch-size">Batch Size</Label>
                <div className="flex gap-2">
                  <Input
                    id="batch-size"
                    type="number"
                    value={batchSize === 'all' ? '' : batchSize}
                    onChange={(e) => setBatchSize(e.target.value)}
                    placeholder="250"
                    min={1}
                    className="w-28"
                    disabled={batchSize === 'all'}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant={batchSize === 'all' ? 'default' : 'outline'}
                    onClick={() =>
                      setBatchSize(batchSize === 'all' ? '250' : 'all')
                    }
                  >
                    All ({matchingCount})
                  </Button>
                </div>
              </div>

              {/* Randomize */}
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={randomize}
                  onChange={(e) => setRandomize(e.target.checked)}
                  className="rounded border-input"
                />
                <Shuffle className="h-3.5 w-3.5 text-muted-foreground" />
                Randomize feedback source order (AI/HUMAN mixed)
              </label>

              {/* Custom name */}
              <div className="space-y-2">
                <Label htmlFor="batch-name">
                  Batch Name{' '}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="batch-name"
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  placeholder="Auto-generated if left blank"
                />
              </div>

              {createError && (
                <p className="text-sm text-destructive">{createError}</p>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCreateOpen(false)
                    setCreateError('')
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={creating || matchingCount === 0}
                >
                  {creating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    `Create Batch (${batchSize === 'all' ? matchingCount : Math.min(parseInt(batchSize) || 250, matchingCount)} items)`
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Batch list filters */}
      {batches.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Filter:</span>
          <select
            className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm transition-colors"
            value={filterActivity}
            onChange={(e) => {
              setFilterActivity(e.target.value)
              setFilterConjunction('')
            }}
          >
            <option value="">All activities</option>
            {batchActivityIds.map((id) => (
              <option key={id} value={id}>Activity {id}</option>
            ))}
          </select>
          <select
            className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm transition-colors"
            value={filterConjunction}
            onChange={(e) => setFilterConjunction(e.target.value)}
          >
            <option value="">All conjunctions</option>
            {batchConjunctionIds.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
          {(filterActivity || filterConjunction) && (
            <span className="text-xs text-muted-foreground">
              {filteredBatches.length} of {batches.length} batches
            </span>
          )}
        </div>
      )}

      {/* Batch list */}
      {batchesLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : batches.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No batches created yet. Import data first, then create batches to
          assign items to evaluators.
        </div>
      ) : (
        <div className="space-y-2">
          {filteredBatches.map((batch) => {
            const pct =
              batch.itemCount > 0
                ? Math.round(
                    (batch.scoredItemCount / batch.itemCount) * 100
                  )
                : 0
            const isTraining = batch.type === 'TRAINING'
            const evaluatorCount = batch.evaluators.length
            const assignmentLabel = isTraining
              ? 'Training'
              : evaluatorCount >= 2
                ? 'Double-Scored'
                : evaluatorCount === 1
                  ? 'Independent'
                  : 'Unassigned'
            const assignmentBadgeClass = isTraining
              ? 'bg-status-active-bg text-status-active-text'
              : evaluatorCount >= 2
                ? 'bg-score-high-bg text-score-high-text'
                : evaluatorCount === 1
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-muted/50 text-muted-foreground/80'
            const maxEvaluators = isTraining
              ? evaluators.length
              : 2
            const canAddMore = evaluatorCount < maxEvaluators
            const selectedEvaluator =
              selectedEvaluatorByBatch[batch.id] ?? ''

            return (
              <Card
                key={batch.id}
                className="transition-all duration-200 hover:shadow-sm hover:ring-1 hover:ring-primary/10"
              >
                <CardContent className="space-y-2 py-3">
                  {/* Line 1: name + badges + status + progress */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="truncate text-sm font-semibold">
                        {batch.name}
                      </span>
                      <Badge
                        className={`${batchStatusColors[batch.status] || ''} shrink-0`}
                      >
                        {batchStatusLabels[batch.status] || batch.status}
                      </Badge>
                      <Badge
                        className={`${assignmentBadgeClass} shrink-0`}
                      >
                        {assignmentLabel}
                      </Badge>
                      {batch.isHidden && (
                        <Badge
                          variant="outline"
                          className="shrink-0 border-muted-foreground/30 bg-muted text-[10px] text-muted-foreground"
                        >
                          Hidden
                        </Badge>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {batch.irrPct != null && (
                        <Badge
                          className={
                            batch.irrPct >= 80
                              ? 'bg-score-high-bg text-score-high-text'
                              : batch.irrPct >= 60
                                ? 'bg-status-active-bg text-status-active-text'
                                : 'bg-destructive/10 text-destructive'
                          }
                          title="Inter-rater reliability: % of scored (item, criterion) pairs where both evaluators gave the same value."
                        >
                          IRR {batch.irrPct}%
                        </Badge>
                      )}
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {batch.status === 'RECONCILING' &&
                        batch.discrepancyCount != null
                          ? `${batch.reconciledCount ?? 0}/${batch.discrepancyCount} reconciled`
                          : `${batch.scoredItemCount}/${batch.itemCount} (${pct}%)`}
                      </span>
                      <select
                        className="flex h-7 rounded-md border border-input bg-background px-2 py-0.5 text-xs shadow-sm transition-colors"
                        value={batch.status}
                        onChange={(e) =>
                          handleBatchStatusChange(batch.id, e.target.value)
                        }
                      >
                        <option value="DRAFT">Draft</option>
                        <option value="SCORING">Scoring</option>
                        <option value="RECONCILING">Reconciling</option>
                        <option value="COMPLETE">Complete</option>
                      </select>
                    </div>
                  </div>

                  {/* Line 2: metadata + progress bar */}
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {batch.itemCount} items
                      {batch.activityId && ` · Activity ${batch.activityId}`}
                      {batch.conjunctionId && ` · ${batch.conjunctionId}`}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Line 3: evaluators + add-evaluator control */}
                  <div className="flex flex-wrap items-center gap-2">
                    {batch.evaluators.length === 0 ? (
                      <span className="text-xs text-muted-foreground/60">
                        No evaluators
                      </span>
                    ) : (
                      batch.evaluators.map((ev) => (
                        <Badge
                          key={ev.id}
                          variant="secondary"
                          className="gap-1"
                        >
                          {ev.name || ev.email}
                          <button
                            onClick={() =>
                              handleRemoveEvaluator(batch.id, ev.id)
                            }
                            className="ml-1 text-muted-foreground hover:text-destructive"
                            aria-label={`Remove ${ev.name || ev.email}`}
                          >
                            &times;
                          </button>
                        </Badge>
                      ))
                    )}

                    {canAddMore && evaluators.length > 0 && (
                      <div className="ml-auto flex items-center gap-1">
                        <select
                          className="flex h-7 rounded-md border border-input bg-background px-2 py-0.5 text-xs shadow-sm transition-colors"
                          value={selectedEvaluator}
                          onChange={(e) =>
                            setSelectedEvaluatorByBatch((prev) => ({
                              ...prev,
                              [batch.id]: e.target.value,
                            }))
                          }
                        >
                          <option value="">
                            {evaluatorCount === 0
                              ? 'Assign evaluator…'
                              : isTraining
                                ? 'Add another…'
                                : 'Add for double-scoring…'}
                          </option>
                          {evaluators
                            .filter(
                              (ev) =>
                                !batch.evaluators.some(
                                  (be) => be.id === ev.user.id
                                )
                            )
                            .map((ev) => (
                              <option key={ev.user.id} value={ev.user.id}>
                                {ev.user.name || ev.user.email}
                              </option>
                            ))}
                        </select>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={
                            !selectedEvaluator ||
                            assigningBatch === batch.id
                          }
                          onClick={() => {
                            if (selectedEvaluator) {
                              handleAssignEvaluator(
                                batch.id,
                                selectedEvaluator
                              )
                            }
                          }}
                        >
                          {assigningBatch === batch.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Add'
                          )}
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Line 4: adjudicator (Double-Scored only) + visibility */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    {evaluatorCount >= 2 && !isTraining && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          Adjudicator:
                        </span>
                        <select
                          className="flex h-7 rounded-md border border-input bg-background px-2 py-0.5 text-xs shadow-sm transition-colors"
                          value={batch.adjudicatorId ?? ''}
                          onChange={(e) =>
                            handleAdjudicatorChange(
                              batch.id,
                              e.target.value || null
                            )
                          }
                        >
                          <option value="">— None —</option>
                          {evaluators.map((ev) => (
                            <option key={ev.user.id} value={ev.user.id}>
                              {ev.user.name || ev.user.email}
                            </option>
                          ))}
                        </select>
                        {!batch.adjudicatorId && (
                          <span className="text-muted-foreground/60">
                            (needed before the pair can escalate)
                          </span>
                        )}
                      </div>
                    )}
                    <label className="flex cursor-pointer items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={!!batch.isHidden}
                        onChange={(e) =>
                          handleVisibilityChange(batch.id, e.target.checked)
                        }
                        className="size-3.5 rounded border-input"
                      />
                      <span className="text-muted-foreground">
                        Hidden from annotators
                      </span>
                    </label>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
