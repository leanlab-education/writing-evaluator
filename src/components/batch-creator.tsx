'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, Loader2, Plus } from 'lucide-react'
import { batchStatusColors, batchStatusLabels } from '@/lib/status-colors'
import { cn } from '@/lib/utils'

interface TeamReleaseRow {
  id: string
  teamId: string
  teamName: string
  isVisible: boolean
  status: string
  scorerUserId: string | null
  scorer: { id: string; email: string; name: string | null } | null
  members: { id: string; email: string; name: string | null }[]
  dimensions: { id: string; label: string }[]
  progressPct: number
  irr?: {
    isApplicable: boolean
    isReady: boolean
    agreementPct: number | null
    agreedPairs: number
    totalPairs: number
  } | null
}

interface BatchRangeRow {
  id: string
  startFeedbackId: string
  endFeedbackId: string
  itemCount: number
}

interface BatchRow {
  id: string
  name: string
  activityId: string | null
  conjunctionId: string | null
  status: string
  itemCount: number
  progressPct: number
  discrepancyCount?: number
  reconciledCount?: number
  irrSummary?: {
    applicableTeamCount: number
    computedTeamCount: number
    readyTeamCount: number
    averageAgreementPct: number | null
    lowestAgreementPct: number | null
  } | null
  type: string
  isDoubleScored: boolean
  adjudicatorId?: string | null
  isHidden?: boolean
  ranges: BatchRangeRow[]
  teamReleases: TeamReleaseRow[]
}

interface EvaluatorOption {
  userId: string
  user: { id: string; name: string | null; email: string }
}

interface Props {
  projectId: string
  evaluators: EvaluatorOption[]
  batches: BatchRow[]
  onBatchesChange: (options?: { silent?: boolean }) => void | Promise<void>
  batchesLoading: boolean
}

function getIrrBadgeClass(agreementPct: number | null, isReady: boolean) {
  if (agreementPct == null) {
    return 'bg-muted text-muted-foreground'
  }

  if (isReady) {
    return 'bg-score-high-bg text-score-high-text'
  }

  if (agreementPct >= 60) {
    return 'bg-status-active-bg text-status-active-text'
  }

  return 'bg-destructive/10 text-destructive'
}

export function BatchCreator({
  projectId,
  evaluators,
  batches,
  onBatchesChange,
  batchesLoading,
}: Props) {
  const [localBatches, setLocalBatches] = useState<BatchRow[]>(batches)
  const [filterActivity, setFilterActivity] = useState('')
  const [filterConjunction, setFilterConjunction] = useState('')
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set())

  useEffect(() => {
    setLocalBatches(batches)
  }, [batches])

  const batchActivityIds = useMemo(
    () => [...new Set(localBatches.map((batch) => batch.activityId).filter(Boolean) as string[])].sort(),
    [localBatches]
  )
  const batchConjunctionIds = useMemo(
    () =>
      [
        ...new Set(
          localBatches
            .filter((batch) => (filterActivity ? batch.activityId === filterActivity : true))
            .map((batch) => batch.conjunctionId)
            .filter(Boolean) as string[]
        ),
      ].sort(),
    [localBatches, filterActivity]
  )

  const filteredBatches = localBatches.filter((batch) => {
    if (filterActivity && batch.activityId !== filterActivity) return false
    if (filterConjunction && batch.conjunctionId !== filterConjunction) return false
    return true
  })

  function toggleExpanded(batchId: string) {
    setExpandedBatches((previous) => {
      const next = new Set(previous)
      if (next.has(batchId)) next.delete(batchId)
      else next.add(batchId)
      return next
    })
  }

  async function handleAdjudicatorChange(
    batchId: string,
    adjudicatorId: string | null
  ) {
    try {
      const response = await fetch(`/api/projects/${projectId}/batches/${batchId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adjudicatorId }),
      })
      if (response.ok) {
        await onBatchesChange({ silent: true })
      }
    } catch (error) {
      console.error('Failed to update adjudicator:', error)
    }
  }

  async function handleDeleteBatch(batchId: string) {
    if (!confirm('Delete this batch? Items will return to the unbatched pool.')) return
    try {
      const response = await fetch(`/api/projects/${projectId}/batches/${batchId}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        await onBatchesChange()
      }
    } catch (error) {
      console.error('Failed to delete batch:', error)
    }
  }

  async function handleUpdateTeamRelease(
    batchId: string,
    releaseId: string,
    patch: { isVisible?: boolean; scorerUserId?: string | null }
  ) {
    const previousBatches = localBatches
    setLocalBatches((current) =>
      current.map((batch) =>
        batch.id !== batchId
          ? batch
          : {
              ...batch,
              teamReleases: batch.teamReleases.map((release) =>
                release.id !== releaseId ? release : { ...release, ...patch }
              ),
            }
      )
    )

    try {
      const response = await fetch(
        `/api/projects/${projectId}/batches/${batchId}/releases/${releaseId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        }
      )
      if (response.ok) {
        await onBatchesChange({ silent: true })
      } else {
        setLocalBatches(previousBatches)
      }
    } catch (error) {
      setLocalBatches(previousBatches)
      console.error('Failed to update team release:', error)
    }
  }

  return (
      <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Batches</h2>
          <p className="text-sm text-muted-foreground">
            Create batches from feedback ID ranges, then release them to teams on
            your schedule.
          </p>
        </div>
        <Link
          href={`/admin/${projectId}/batches/new`}
          className={cn(buttonVariants({ variant: 'default' }))}
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Batch
        </Link>
      </div>

      {localBatches.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">Filter:</span>
          <select
            className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm transition-all duration-200"
            value={filterActivity}
            onChange={(event) => {
              setFilterActivity(event.target.value)
              setFilterConjunction('')
            }}
          >
            <option value="">All activities</option>
            {batchActivityIds.map((activityId) => (
              <option key={activityId} value={activityId}>
                Activity {activityId}
              </option>
            ))}
          </select>
          <select
            className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm transition-all duration-200"
            value={filterConjunction}
            onChange={(event) => setFilterConjunction(event.target.value)}
          >
            <option value="">All conjunctions</option>
            {batchConjunctionIds.map((conjunctionId) => (
              <option key={conjunctionId} value={conjunctionId}>
                {conjunctionId}
              </option>
            ))}
          </select>
          {(filterActivity || filterConjunction) && (
            <span className="text-xs text-muted-foreground">
              {filteredBatches.length} of {localBatches.length} batches
            </span>
          )}
        </div>
      )}

      {batchesLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : localBatches.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No batches created yet. Use the full-screen builder to create your first
          batch from feedback ID ranges.
        </div>
      ) : (
        <div className="rounded-md border border-border">
          {filteredBatches.map((batch, index) => {
            const isExpanded = expandedBatches.has(batch.id)
            const visibleReleaseCount = batch.teamReleases.filter(
              (release) => release.isVisible
            ).length
            const assignmentLabel =
              batch.type === 'TRAINING'
                ? 'Training'
                : batch.isDoubleScored
                  ? 'Double'
                  : 'Single'
            const assignmentBadgeClass =
              batch.type === 'TRAINING'
                ? 'bg-status-active-bg text-status-active-text'
                : batch.isDoubleScored
                  ? 'bg-score-high-bg text-score-high-text'
                  : 'bg-muted text-muted-foreground'
            const irrSummary = batch.irrSummary
            const hasApplicableIrr = (irrSummary?.applicableTeamCount ?? 0) > 0

            return (
              <div key={batch.id} className={index > 0 ? 'border-t border-border' : ''}>
                <div
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors hover:bg-muted/50"
                  onClick={() => toggleExpanded(batch.id)}
                >
                  <ChevronRight
                    className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${
                      isExpanded ? 'rotate-90' : ''
                    }`}
                  />
                  <span className="min-w-0 truncate text-sm font-medium">{batch.name}</span>
                  <Badge className={`${batchStatusColors[batch.status] || ''} shrink-0 text-[10px]`}>
                    {batchStatusLabels[batch.status] || batch.status}
                  </Badge>
                  <Badge className={`${assignmentBadgeClass} shrink-0 text-[10px]`}>
                    {assignmentLabel}
                  </Badge>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {visibleReleaseCount}/{batch.teamReleases.length} visible teams
                  </Badge>
                  {hasApplicableIrr && (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      IRR ready {irrSummary?.readyTeamCount}/{irrSummary?.applicableTeamCount}
                    </Badge>
                  )}
                  {irrSummary?.averageAgreementPct != null && (
                    <Badge
                      className={`shrink-0 text-[10px] ${getIrrBadgeClass(
                        irrSummary.averageAgreementPct,
                        irrSummary.averageAgreementPct >= 80
                      )}`}
                    >
                      Avg IRR {irrSummary.averageAgreementPct}%
                    </Badge>
                  )}
                  {irrSummary?.lowestAgreementPct != null && (
                    <Badge
                      className={`shrink-0 text-[10px] ${getIrrBadgeClass(
                        irrSummary.lowestAgreementPct,
                        irrSummary.lowestAgreementPct >= 80
                      )}`}
                    >
                      Low IRR {irrSummary.lowestAgreementPct}%
                    </Badge>
                  )}
                  <div className="ml-auto flex shrink-0 items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${batch.progressPct}%` }}
                      />
                    </div>
                    <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
                      {batch.progressPct}%
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="space-y-2.5 border-t border-border/50 bg-muted/20 px-3 py-2.5 pl-8">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{batch.itemCount} items</span>
                      {batch.activityId && <span>Activity {batch.activityId}</span>}
                      {batch.conjunctionId && <span>{batch.conjunctionId}</span>}
                      <span className="basis-full">
                        Ranges:{' '}
                        {batch.ranges
                          .map(
                            (range) =>
                              `${range.startFeedbackId}-${range.endFeedbackId} (${range.itemCount})`
                          )
                          .join(', ')}
                      </span>
                      <span>
                        Teams visible: {visibleReleaseCount}/{batch.teamReleases.length}
                      </span>
                      {hasApplicableIrr && (
                        <span>
                          IRR ready: {irrSummary?.readyTeamCount}/{irrSummary?.applicableTeamCount}
                        </span>
                      )}
                      <span>
                        Batch status: {batchStatusLabels[batch.status] || batch.status}
                      </span>
                    </div>

                    <div className="space-y-2">
                          {batch.teamReleases.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                              No team assignments found for this batch. New batches
                              assign every team automatically.
                            </div>
                          ) : (
                            batch.teamReleases.map((release) => (
                              <div
                                key={release.id}
                                className="rounded-xl border border-border bg-background/70 px-3 py-2"
                              >
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <div className="text-sm font-medium">{release.teamName}</div>
                                <Badge className={`${batchStatusColors[release.status] || ''} text-[10px]`}>
                                  {batchStatusLabels[release.status] || release.status}
                                </Badge>
                                <Badge variant="outline" className="text-[10px]">
                                  {release.progressPct}%
                                </Badge>
                                {release.irr?.isApplicable && (
                                  <Badge
                                    className={`text-[10px] ${getIrrBadgeClass(
                                      release.irr.agreementPct,
                                      release.irr.isReady
                                    )}`}
                                  >
                                    {release.irr.agreementPct == null
                                      ? 'IRR pending'
                                      : `IRR ${release.irr.agreementPct}%`}
                                  </Badge>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {batch.type === 'TRAINING'
                                    ? 'Criteria: All criteria'
                                    : `Criteria: ${release.dimensions.map((dimension) => dimension.label).join(', ')}`}
                                </span>
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                <span className="text-muted-foreground">
                                  Members:{' '}
                                  {release.members
                                    .map((member) => member.name || member.email)
                                    .join(', ')}
                                </span>
                                {release.irr?.isApplicable && (
                                  <span className="text-muted-foreground">
                                    Compared pairs: {release.irr.totalPairs > 0
                                      ? `${release.irr.agreedPairs}/${release.irr.totalPairs} agreed`
                                      : 'Not enough scores yet'}
                                  </span>
                                )}
                                {batch.type === 'REGULAR' && !batch.isDoubleScored && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground">Scorer:</span>
                                    <select
                                      className="flex h-6 rounded-md border border-input bg-background px-2 py-0.5 text-xs shadow-sm transition-all duration-200"
                                      value={release.scorerUserId || ''}
                                      onChange={(event) =>
                                        handleUpdateTeamRelease(batch.id, release.id, {
                                          scorerUserId: event.target.value || null,
                                        })
                                      }
                                    >
                                      {release.members.map((member) => (
                                        <option key={member.id} value={member.id}>
                                          {member.name || member.email}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                                <label className="flex cursor-pointer items-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={release.isVisible}
                                    onChange={(event) =>
                                      handleUpdateTeamRelease(batch.id, release.id, {
                                        isVisible: event.target.checked,
                                      })
                                    }
                                    className="size-3.5 rounded border-input"
                                  />
                                  <span className="text-muted-foreground">Visible now</span>
                                </label>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                      {batch.type === 'REGULAR' && batch.isDoubleScored && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Adjudicator:</span>
                          <select
                            className="flex h-6 rounded-md border border-input bg-background px-2 py-0.5 text-xs shadow-sm transition-all duration-200"
                            value={batch.adjudicatorId ?? ''}
                            onChange={(event) =>
                              handleAdjudicatorChange(batch.id, event.target.value || null)
                            }
                          >
                            <option value="">— None —</option>
                            {evaluators.map((evaluator) => (
                              <option key={evaluator.user.id} value={evaluator.user.id}>
                                {evaluator.user.name || evaluator.user.email}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      {batch.status === 'DRAFT' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-auto h-6 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => handleDeleteBatch(batch.id)}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
