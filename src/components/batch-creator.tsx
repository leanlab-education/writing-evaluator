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
  size: number
  sortOrder: number
  itemCount: number
  scoredItemCount: number
  evaluators: BatchEvaluator[]
  type?: string
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
  const [batchSize, setBatchSize] = useState('250')
  const [batchName, setBatchName] = useState('')
  const [randomize, setRandomize] = useState(true)
  const [batchType, setBatchType] = useState<'REGULAR' | 'CALIBRATION'>(
    'REGULAR'
  )

  // Unbatched stats
  const [unbatchedStats, setUnbatchedStats] = useState<{
    totalUnbatched: number
    groups: UnbatchedGroup[]
  } | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)

  // Batch assignment
  const [assigningBatch, setAssigningBatch] = useState<string | null>(null)
  const [selectedEvaluator, setSelectedEvaluator] = useState('')
  const [selectedRole, setSelectedRole] = useState<'PRIMARY' | 'DOUBLE'>(
    'PRIMARY'
  )

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
    setAssigningBatch(batchId)
    try {
      const res = await fetch(
        `/api/projects/${projectId}/batches/${batchId}/assign`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userIds: [userId],
            scoringRole: selectedRole,
          }),
        }
      )
      if (res.ok) {
        onBatchesChange()
        setSelectedEvaluator('')
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
                      batchType === 'CALIBRATION' ? 'default' : 'outline'
                    }
                    onClick={() => setBatchType('CALIBRATION')}
                  >
                    Calibration (IRR)
                  </Button>
                </div>
                {batchType === 'CALIBRATION' && (
                  <p className="text-xs text-muted-foreground">
                    All evaluators will score all 8 criteria for calibration
                    items.
                  </p>
                )}
              </div>

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
        <div className="space-y-4">
          {batches.map((batch) => {
            const pct =
              batch.itemCount > 0
                ? Math.round(
                    (batch.scoredItemCount / batch.itemCount) * 100
                  )
                : 0
            const isCalibration = batch.type === 'CALIBRATION'

            return (
              <Card key={batch.id} className="transition-all duration-200 hover:shadow-sm hover:ring-1 hover:ring-primary/10">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">
                        {batch.name}
                      </CardTitle>
                      {isCalibration && (
                        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                          Calibration
                        </Badge>
                      )}
                    </div>
                    <Badge variant="outline">
                      {batch.scoredItemCount}/{batch.itemCount} scored ({pct}%)
                    </Badge>
                  </div>
                  <CardDescription>
                    {batch.itemCount} items
                    {batch.activityId &&
                      ` \u00b7 Activity ${batch.activityId}`}
                    {batch.conjunctionId &&
                      ` \u00b7 ${batch.conjunctionId}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Progress bar */}
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {/* Assigned evaluators */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Assigned Evaluators
                    </p>
                    {batch.evaluators.length === 0 ? (
                      <p className="text-xs text-muted-foreground/60">
                        No evaluators assigned
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {batch.evaluators.map((ev) => (
                          <Badge
                            key={ev.id}
                            variant="secondary"
                            className="gap-1"
                          >
                            {ev.name || ev.email}
                            {ev.scoringRole === 'DOUBLE' && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                (IRR)
                              </span>
                            )}
                            <button
                              onClick={() =>
                                handleRemoveEvaluator(batch.id, ev.id)
                              }
                              className="ml-1 text-muted-foreground hover:text-destructive"
                            >
                              &times;
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Add evaluator to batch */}
                    {evaluators.length > 0 && (
                      <div className="flex items-center gap-2">
                        <select
                          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors"
                          value={selectedEvaluator}
                          onChange={(e) =>
                            setSelectedEvaluator(e.target.value)
                          }
                        >
                          <option value="">Add evaluator...</option>
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
                        <select
                          className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors"
                          value={selectedRole}
                          onChange={(e) =>
                            setSelectedRole(
                              e.target.value as 'PRIMARY' | 'DOUBLE'
                            )
                          }
                        >
                          <option value="PRIMARY">Primary</option>
                          <option value="DOUBLE">Double (IRR)</option>
                        </select>
                        <Button
                          size="sm"
                          variant="outline"
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
                            <Plus className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    )}
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
