'use client'

import { useEffect, useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { statusColors } from '@/lib/status-colors'

export interface FeedbackItemRow {
  id: string
  feedbackId: string
  activityId: string | null
  conjunctionId: string | null
  batchId: string | null
  batch: { id: string; name: string; type: string; status: string } | null
}

interface InitialData {
  items: FeedbackItemRow[]
  total: number
  unassignedTotal: number
  filterOptions: { activityIds: string[]; conjunctionIds: string[] }
}

interface Props {
  projectId: string
  initialData: InitialData
}

const LIMIT = 50

export function FeedbackItemsTab({ projectId, initialData }: Props) {
  const [items, setItems] = useState<FeedbackItemRow[]>(initialData.items)
  const [total, setTotal] = useState(initialData.total)
  const [unassignedTotal, setUnassignedTotal] = useState(
    initialData.unassignedTotal
  )
  const [filterOptions, setFilterOptions] = useState(initialData.filterOptions)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [activityFilter, setActivityFilter] = useState('')
  const [conjunctionFilter, setConjunctionFilter] = useState('')
  const [batchedFilter, setBatchedFilter] = useState<'all' | 'true' | 'false'>(
    'all'
  )
  const [initialLoad, setInitialLoad] = useState(true)

  async function fetchItems(newPage: number) {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(newPage),
        limit: String(LIMIT),
      })
      if (activityFilter) params.set('activityId', activityFilter)
      if (conjunctionFilter) params.set('conjunctionId', conjunctionFilter)
      if (batchedFilter !== 'all') params.set('batched', batchedFilter)
      const res = await fetch(
        `/api/projects/${projectId}/feedback-items?${params}`
      )
      if (res.ok) {
        const data = await res.json()
        setItems(data.items)
        setTotal(data.total)
        setUnassignedTotal(data.unassignedTotal)
        setFilterOptions(data.filterOptions)
        setPage(newPage)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialLoad) {
      setInitialLoad(false)
      return
    }
    fetchItems(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityFilter, conjunctionFilter, batchedFilter])

  const pageCount = Math.max(1, Math.ceil(total / LIMIT))
  const rangeStart = total === 0 ? 0 : (page - 1) * LIMIT + 1
  const rangeEnd = Math.min(total, page * LIMIT)

  const hasAnyFilter =
    activityFilter || conjunctionFilter || batchedFilter !== 'all'

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">
          Filter:
        </span>
        <select
          className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm transition-all duration-200"
          value={activityFilter}
          onChange={(e) => setActivityFilter(e.target.value)}
        >
          <option value="">All activities</option>
          {filterOptions.activityIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <select
          className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm transition-all duration-200"
          value={conjunctionFilter}
          onChange={(e) => setConjunctionFilter(e.target.value)}
        >
          <option value="">All conjunctions</option>
          {filterOptions.conjunctionIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
        <div className="flex rounded-md border border-input">
          {(['all', 'true', 'false'] as const).map((val, idx) => (
            <button
              key={val}
              onClick={() => setBatchedFilter(val)}
              className={`h-8 px-3 text-sm transition-all duration-200 ${
                batchedFilter === val
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50'
              } ${idx === 0 ? 'rounded-l-md' : ''} ${idx === 2 ? 'rounded-r-md' : ''}`}
            >
              {val === 'all' ? 'All' : val === 'true' ? 'Batched' : 'Unassigned'}
            </button>
          ))}
        </div>
        {hasAnyFilter && (
          <button
            onClick={() => {
              setActivityFilter('')
              setConjunctionFilter('')
              setBatchedFilter('all')
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition-all duration-200"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>
          Showing {rangeStart}–{rangeEnd} of {total}{' '}
          {total === 1 ? 'item' : 'items'}
        </span>
        <span>·</span>
        <span>{unassignedTotal} unassigned overall</span>
        {loading && <Loader2 className="ml-2 h-3.5 w-3.5 animate-spin" />}
      </div>

      {/* Table */}
      {items.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No feedback items match these filters.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feedback ID</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Conjunction</TableHead>
                <TableHead>Batched</TableHead>
                <TableHead>Batch</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const isBatched = item.batchId !== null
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-xs">
                      {item.feedbackId}
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.activityId || '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.conjunctionId || '—'}
                    </TableCell>
                    <TableCell>
                      {isBatched ? (
                        <Badge
                          variant="outline"
                          className="bg-success/10 text-success border-success/20"
                        >
                          Batched
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-muted text-muted-foreground"
                        >
                          Unassigned
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.batch ? (
                        <div className="flex items-center gap-2">
                          <span>{item.batch.name}</span>
                          <Badge
                            variant="outline"
                            className={`text-xs ${statusColors[item.batch.status] || ''}`}
                          >
                            {item.batch.status}
                          </Badge>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchItems(page - 1)}
              disabled={page <= 1 || loading}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchItems(page + 1)}
              disabled={page >= pageCount || loading}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
