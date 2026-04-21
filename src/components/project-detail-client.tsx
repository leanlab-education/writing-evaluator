'use client'

import { useRouter } from 'next/navigation'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Plus,
  Upload,
  Download,
  Users,
  FileText,
  BarChart3,
  Loader2,
  ArrowLeft,
  CheckCircle,
  Eye,
} from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { statusColors } from '@/lib/status-colors'
import { TeamManagement } from '@/components/team-management'
import { BatchCreator } from '@/components/batch-creator'
import { ImportEvaluatorsDialog } from '@/components/import-evaluators-dialog'
import { FeedbackItemsTab, type FeedbackItemRow } from '@/components/feedback-items-tab'

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

interface Project {
  id: string
  name: string
  description: string | null
  status: string
  discrepancyThreshold: number
  studyflowStudyId: string | null
  createdAt: string
  rubric: RubricDimension[]
  _count: {
    feedbackItems: number
    evaluators: number
    assignments: number
  }
}

interface EvaluatorRow {
  id: string
  userId: string
  user: {
    id: string
    name: string | null
    email: string
  }
  _count: {
    assignments: number
  }
  completedCount: number
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
  progressPct: number
  type: string
  isDoubleScored: boolean
  adjudicatorId?: string | null
  isHidden?: boolean
  discrepancyCount?: number
  reconciledCount?: number
  irrPct?: number | null
  ranges: {
    id: string
    startFeedbackId: string
    endFeedbackId: string
    itemCount: number
  }[]
  teamReleases: {
    id: string
    teamId: string
    teamName: string
    isVisible: boolean
    scorerUserId: string | null
    scorer: { id: string; email: string; name: string | null } | null
    members: { id: string; email: string; name: string | null }[]
    dimensions: { id: string; label: string }[]
    progressPct: number
  }[]
  evaluators: {
    id: string
    email: string
    name: string | null
    scoringRole?: string
    isVisible?: boolean
  }[]
}

interface BatchRefreshOptions {
  silent?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProjectDetailClient({
  initialProject,
  initialEvaluators,
  initialScoredItemCount,
  initialFeedbackItemsData,
  initialActiveTab,
}: {
  initialProject: Project
  initialEvaluators: EvaluatorRow[]
  initialScoredItemCount: number
  initialFeedbackItemsData: {
    items: FeedbackItemRow[]
    total: number
    unassignedTotal: number
    filterOptions: { activityIds: string[]; conjunctionIds: string[] }
  }
  initialActiveTab: string
}) {
  const router = useRouter()
  const projectId = initialProject.id

  const [project, setProject] = useState<Project>(initialProject)
  const [evaluators, setEvaluators] = useState<EvaluatorRow[]>(initialEvaluators)
  const [scoredItemCount] = useState(initialScoredItemCount)
  const [activeTab, setActiveTab] = useState(initialActiveTab)

  // Add evaluator dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [evalEmail, setEvalEmail] = useState('')
  const [evalName, setEvalName] = useState('')
  const [addingEvaluator, setAddingEvaluator] = useState(false)
  const [evalError, setEvalError] = useState('')
  const [evalSuccess, setEvalSuccess] = useState('')

  // Assignments
  const [assigning, setAssigning] = useState(false)
  const [assignResult, setAssignResult] = useState('')

  // Batches
  const [batches, setBatches] = useState<BatchRow[]>([])
  const [batchesLoading, setBatchesLoading] = useState(false)

  // Export filters
  const [exportActivity, setExportActivity] = useState('')
  const [exportConjunction, setExportConjunction] = useState('')
  const [discrepancyBatchId, setDiscrepancyBatchId] = useState('')

  // ---------------------------------------------------------------------------
  // Data re-fetching (after mutations)
  // ---------------------------------------------------------------------------

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`)
      if (res.ok) {
        const data = await res.json()
        setProject(data)
      }
    } catch (err) {
      console.error('Failed to fetch project:', err)
    }
  }, [projectId])

  const fetchEvaluators = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/evaluators`)
      if (res.ok) {
        const data = await res.json()
        setEvaluators(data)
      }
    } catch (err) {
      console.error('Failed to fetch evaluators:', err)
    }
  }, [projectId])

  const fetchBatches = useCallback(async (options?: BatchRefreshOptions) => {
    if (!options?.silent) {
      setBatchesLoading(true)
    }
    try {
      const res = await fetch(`/api/projects/${projectId}/batches`)
      if (res.ok) {
        const data = await res.json()
        setBatches(data)
      }
    } catch (err) {
      console.error('Failed to fetch batches:', err)
    } finally {
      if (!options?.silent) {
        setBatchesLoading(false)
      }
    }
  }, [projectId])

  useEffect(() => {
    if (activeTab === 'batches') {
      fetchBatches()
    }
  }, [activeTab, fetchBatches])

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function handleAddEvaluator(e: React.FormEvent) {
    e.preventDefault()
    setEvalError('')
    setEvalSuccess('')
    setAddingEvaluator(true)

    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: evalEmail.trim(),
          name: evalName.trim() || null,
          projectId,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setEvalEmail('')
        setEvalName('')
        if (data.invited) {
          setEvalSuccess('Invitation email sent!')
        } else if (data.alreadyHasPassword) {
          setEvalSuccess('Annotator added (already has an account).')
        }
        await fetchEvaluators()
        await fetchProject()
        // Auto-close after a brief delay so the user sees the success message
        setTimeout(() => {
          setAddDialogOpen(false)
          setEvalSuccess('')
        }, 1500)
      } else {
        const err = await res.json()
        setEvalError(err.error || 'Failed to add evaluator')
      }
    } catch (err) {
      console.error('Failed to add evaluator:', err)
      setEvalError('Something went wrong')
    } finally {
      setAddingEvaluator(false)
    }
  }

  async function handleAssignAll() {
    setAssigning(true)
    setAssignResult('')

    try {
      const res = await fetch(`/api/projects/${projectId}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (res.ok) {
        const data = await res.json()
        setAssignResult(`Created ${data.created} assignments`)
        await fetchEvaluators()
        await fetchProject()
      } else {
        const err = await res.json()
        setAssignResult(err.error || 'Failed to create assignments')
      }
    } catch (err) {
      console.error('Failed to assign items:', err)
      setAssignResult('Something went wrong')
    } finally {
      setAssigning(false)
    }
  }

  function handleExport(type: 'original' | 'reconciled') {
    const params = new URLSearchParams({ projectId, type })
    if (exportActivity) params.set('activityId', exportActivity)
    if (exportConjunction) params.set('conjunctionId', exportConjunction)
    window.open(`/api/export?${params.toString()}`, '_blank')
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function parseScoreLabels(
    json: string | null
  ): Record<string, { label: string; description: string }> {
    if (!json) return {}
    try {
      return JSON.parse(json)
    } catch {
      return {}
    }
  }

  const totalItems = project._count.feedbackItems
  const completionPct =
    totalItems > 0 ? Math.round((scoredItemCount / totalItems) * 100) : 0

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------

  return (
    <AppShell
      projectContext={{
        id: project.id,
        name: project.name,
        activeTab,
        onTabChange: (tab) => {
          setActiveTab(tab)
          if (tab === 'batches') fetchBatches()
        },
      }}
    >
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            className="mb-2"
            onClick={() => router.push('/admin')}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            All Projects
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {project.name}
            </h1>
            {(() => {
              // Derive display status from batch states
              const statuses = batches.map((b) => b.status)
              let displayStatus = project.status
              if (statuses.length > 0) {
                if (statuses.every((s) => s === 'COMPLETE')) displayStatus = 'COMPLETE'
                else if (statuses.some((s) => s === 'RECONCILING')) displayStatus = 'RECONCILIATION'
                else if (statuses.some((s) => s === 'SCORING')) displayStatus = 'ACTIVE'
                else displayStatus = 'SETUP'
              }
              return (
                <Badge
                  variant="outline"
                  className={statusColors[displayStatus] || ''}
                >
                  {displayStatus}
                </Badge>
              )
            })()}
          </div>
          {project.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {project.description}
            </p>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => {
          setActiveTab(v)
          if (v === 'batches') fetchBatches()
        }}>
          {/* Mobile-only tab list (sidebar handles desktop nav) */}
          <TabsList className="lg:hidden">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="evaluators">Annotators</TabsTrigger>
            <TabsTrigger value="teams">Teams</TabsTrigger>
            <TabsTrigger value="batches">Batches</TabsTrigger>
            <TabsTrigger value="items">Items</TabsTrigger>
            <TabsTrigger value="rubric">Rubric</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>

          {/* ============== OVERVIEW TAB ============== */}
          <TabsContent value="overview" className="mt-6 space-y-6">
            {/* Stats */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Items</CardDescription>
                  <CardTitle className="text-2xl">{totalItems}</CardTitle>
                </CardHeader>
                <CardContent>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Scored Items</CardDescription>
                  <CardTitle className="text-2xl">{scoredItemCount}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Annotators</CardDescription>
                  <CardTitle className="text-2xl">
                    {project._count.evaluators}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Completion</CardDescription>
                  <CardTitle className="text-2xl">{completionPct}%</CardTitle>
                </CardHeader>
                <CardContent>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() =>
                  router.push(`/admin/${projectId}/import`)
                }
              >
                <Upload className="mr-2 h-4 w-4" />
                Import Data
              </Button>

              {totalItems > 0 && (
                <Button
                  variant="outline"
                  onClick={() =>
                    router.push(`/evaluate/${projectId}`)
                  }
                >
                  <Eye className="mr-2 h-4 w-4" />
                  Preview Annotator View
                </Button>
              )}

            </div>

            {/* StudyFlow Integration */}
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>StudyFlow Integration</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-3">
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="studyflow-id" className="text-xs text-muted-foreground">
                      StudyFlow Study ID
                    </Label>
                    <Input
                      id="studyflow-id"
                      value={project.studyflowStudyId || ''}
                      onChange={(e) => {
                        setProject((prev) => ({ ...prev, studyflowStudyId: e.target.value || null }))
                      }}
                      placeholder="e.g. clx1abc2d..."
                      className="font-mono text-sm"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await fetch(`/api/projects/${projectId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ studyflowStudyId: project.studyflowStudyId }),
                      })
                      await fetchProject()
                    }}
                  >
                    Save
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Link this project to a StudyFlow study to enable participant import.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============== ANNOTATORS TAB ============== */}
          <TabsContent value="evaluators" className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Annotators</h2>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleAssignAll}
                  disabled={assigning}
                >
                  {assigning ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Users className="mr-2 h-4 w-4" />
                  )}
                  Assign All Items
                </Button>

                {project.studyflowStudyId && (
                  <ImportEvaluatorsDialog
                    projectId={projectId}
                    onImported={() => { fetchEvaluators(); fetchProject() }}
                  />
                )}

                <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                  <DialogTrigger render={<Button />}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Annotator
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Annotator</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleAddEvaluator} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="eval-email">Email</Label>
                        <Input
                          id="eval-email"
                          type="email"
                          value={evalEmail}
                          onChange={(e) => setEvalEmail(e.target.value)}
                          placeholder="annotator@example.com"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="eval-name">Name (optional)</Label>
                        <Input
                          id="eval-name"
                          value={evalName}
                          onChange={(e) => setEvalName(e.target.value)}
                          placeholder="Jane Doe"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        An invitation email will be sent so they can set their own password.
                      </p>
                      {evalError && (
                        <p className="text-sm text-destructive">{evalError}</p>
                      )}
                      {evalSuccess && (
                        <p className="text-sm text-success">{evalSuccess}</p>
                      )}
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setAddDialogOpen(false)
                            setEvalError('')
                            setEvalSuccess('')
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={addingEvaluator || !evalEmail}
                        >
                          {addingEvaluator ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Sending...
                            </>
                          ) : (
                            'Send Invite'
                          )}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {assignResult && (
              <Alert>
                <AlertDescription>{assignResult}</AlertDescription>
              </Alert>
            )}

            {evaluators.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No annotators assigned to this project yet.
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead className="text-right">Assigned</TableHead>
                      <TableHead className="text-right">Completed</TableHead>
                      <TableHead className="text-right">Completion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {evaluators.map((ev) => {
                      const assigned = ev._count.assignments
                      const completed = ev.completedCount
                      const pct =
                        assigned > 0
                          ? Math.round((completed / assigned) * 100)
                          : 0
                      return (
                        <TableRow key={ev.id}>
                          <TableCell className="font-medium">
                            {ev.user.name || '-'}
                          </TableCell>
                          <TableCell>{ev.user.email}</TableCell>
                          <TableCell className="text-right">
                            {assigned}
                          </TableCell>
                          <TableCell className="text-right">
                            {completed}
                          </TableCell>
                          <TableCell className="text-right">{pct}%</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* ============== TEAMS TAB ============== */}
          <TabsContent value="teams" className="mt-6">
            <TeamManagement
              projectId={projectId}
              evaluators={evaluators.map((ev) => ({
                userId: ev.user.id,
                user: ev.user,
              }))}
              rubricDimensions={project.rubric.map((d) => ({
                id: d.id,
                key: d.key,
                label: d.label,
                sortOrder: d.sortOrder,
              }))}
            />
          </TabsContent>

          {/* ============== BATCHES TAB ============== */}
          <TabsContent value="batches" className="mt-6">
            <BatchCreator
              projectId={projectId}
              evaluators={evaluators.map((ev) => ({
                userId: ev.user.id,
                user: ev.user,
              }))}
              batches={batches}
              onBatchesChange={fetchBatches}
              batchesLoading={batchesLoading}
            />
          </TabsContent>

          {/* ============== ITEMS TAB ============== */}
          <TabsContent value="items" className="mt-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Feedback Items</h2>
              <p className="text-sm text-muted-foreground">
                All feedback items in this project and their batch assignment.
              </p>
            </div>
            <FeedbackItemsTab
              projectId={projectId}
              initialData={initialFeedbackItemsData}
            />
          </TabsContent>

          {/* ============== RUBRIC TAB ============== */}
          <TabsContent value="rubric" className="mt-6 space-y-4">
            <h2 className="text-lg font-semibold">Rubric Dimensions</h2>
            <p className="text-sm text-muted-foreground">
              The scoring rubric applied to each feedback item. Editing is not
              available in this version.
            </p>

            {project.rubric.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No rubric dimensions configured.
              </div>
            ) : (
              <div className="space-y-4">
                {project.rubric.map((dim) => {
                  const labels = parseScoreLabels(dim.scoreLabelJson)
                  return (
                    <Card key={dim.id}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">
                            {dim.label}
                          </CardTitle>
                          <Badge variant="outline" className="text-xs">
                            {dim.key}
                          </Badge>
                        </div>
                        {dim.description && (
                          <CardDescription>{dim.description}</CardDescription>
                        )}
                      </CardHeader>
                      <CardContent>
                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                          Scale: {dim.scaleMin} - {dim.scaleMax}
                        </p>
                        {Object.keys(labels).length > 0 && (
                          <div className="space-y-1">
                            {Object.entries(labels).map(([score, info]) => (
                              <div
                                key={score}
                                className="flex items-start gap-2 text-sm"
                              >
                                <Badge variant="outline" className="mt-0.5 shrink-0">
                                  {score}
                                </Badge>
                                <div>
                                  <span className="font-medium">
                                    {info.label}
                                  </span>
                                  {info.description && (
                                    <span className="text-muted-foreground">
                                      {' '}
                                      &mdash; {info.description}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </TabsContent>

          {/* ============== EXPORT TAB ============== */}
          <TabsContent value="export" className="mt-6 space-y-6">
            <h2 className="text-lg font-semibold">Export Scores</h2>
            <p className="text-sm text-muted-foreground">
              Download evaluation scores as CSV files for analysis.
            </p>

            {/* Export filters */}
            {(() => {
              const expActivityIds = [...new Set(batches.map((b) => b.activityId).filter(Boolean) as string[])].sort()
              const expConjunctionIds = [...new Set(
                batches
                  .filter((b) => (exportActivity ? b.activityId === exportActivity : true))
                  .map((b) => b.conjunctionId)
                  .filter(Boolean) as string[]
              )].sort()
              return (
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-muted-foreground">Filter:</span>
                  <select
                    className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm transition-colors"
                    value={exportActivity}
                    onChange={(e) => {
                      setExportActivity(e.target.value)
                      setExportConjunction('')
                    }}
                  >
                    <option value="">All activities</option>
                    {expActivityIds.map((id) => (
                      <option key={id} value={id}>Activity {id}</option>
                    ))}
                  </select>
                  <select
                    className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm transition-colors"
                    value={exportConjunction}
                    onChange={(e) => setExportConjunction(e.target.value)}
                  >
                    <option value="">All conjunctions</option>
                    {expConjunctionIds.map((id) => (
                      <option key={id} value={id}>{id}</option>
                    ))}
                  </select>
                  {(exportActivity || exportConjunction) && (
                    <button
                      onClick={() => { setExportActivity(''); setExportConjunction('') }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )
            })()}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Original Scores</CardTitle>
                  <CardDescription>
                    Raw scores from each evaluator, one row per evaluator per
                    feedback item.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-xs text-muted-foreground">
                    Columns: feedback_ID, evaluator_email,{' '}
                    {project.rubric.map((d) => d.key).join(', ')}, notes,
                    feedback_source, timestamp
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => handleExport('original')}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export Original CSV
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Reconciled Scores
                  </CardTitle>
                  <CardDescription>
                    Final reconciled scores after discrepancy resolution.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-xs text-muted-foreground">
                    Columns: feedback_ID, evaluator_email,{' '}
                    {project.rubric.map((d) => d.key).join(', ')}, notes,
                    feedback_source, timestamp
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => handleExport('reconciled')}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export Reconciled CSV
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Discrepancy Report
                  </CardTitle>
                  <CardDescription>
                    Pre-reconciliation report of all scoring differences between evaluators.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-xs text-muted-foreground">
                    Columns: feedback_ID, dimension, evaluator_A_score,
                    evaluator_B_score, difference
                  </p>
                  {(() => {
                    const reconcilingBatches = batches.filter(
                      (b) => b.status === 'RECONCILING' || b.status === 'COMPLETE'
                    )
                    if (reconcilingBatches.length === 0) {
                      return (
                        <p className="text-xs text-muted-foreground italic">
                          No batches in reconciliation or complete status.
                        </p>
                      )
                    }
                    return (
                      <div className="flex flex-col gap-3">
                        <select
                          className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm transition-colors"
                          value={discrepancyBatchId}
                          onChange={(e) => setDiscrepancyBatchId(e.target.value)}
                        >
                          <option value="">Select batch...</option>
                          {reconcilingBatches.map((b) => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                        <Button
                          variant="outline"
                          disabled={!discrepancyBatchId}
                          onClick={() => {
                            const params = new URLSearchParams({ projectId, type: 'discrepancies', batchId: discrepancyBatchId })
                            window.open(`/api/export?${params.toString()}`, '_blank')
                          }}
                        >
                          <Download className="mr-2 h-4 w-4" />
                          Export Discrepancies CSV
                        </Button>
                      </div>
                    )
                  })()}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}
