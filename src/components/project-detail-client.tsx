'use client'

import { useRouter } from 'next/navigation'
import { useState, useCallback } from 'react'
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
} from 'lucide-react'

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

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const statusColors: Record<string, string> = {
  SETUP: 'bg-yellow-100 text-yellow-800',
  ACTIVE: 'bg-green-100 text-green-800',
  RECONCILIATION: 'bg-blue-100 text-blue-800',
  COMPLETE: 'bg-gray-100 text-gray-800',
}

const statusFlow: Record<string, string> = {
  SETUP: 'ACTIVE',
  ACTIVE: 'COMPLETE',
}

const statusActionLabel: Record<string, string> = {
  SETUP: 'Start Evaluations',
  ACTIVE: 'Mark Complete',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProjectDetailClient({
  initialProject,
  initialEvaluators,
  initialScoredItemCount,
}: {
  initialProject: Project
  initialEvaluators: EvaluatorRow[]
  initialScoredItemCount: number
}) {
  const router = useRouter()
  const projectId = initialProject.id

  const [project, setProject] = useState<Project>(initialProject)
  const [evaluators, setEvaluators] = useState<EvaluatorRow[]>(initialEvaluators)
  const [scoredItemCount, setScoredItemCount] = useState(initialScoredItemCount)
  const [statusChanging, setStatusChanging] = useState(false)

  // Add evaluator dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [evalEmail, setEvalEmail] = useState('')
  const [evalName, setEvalName] = useState('')
  const [evalPassword, setEvalPassword] = useState('')
  const [addingEvaluator, setAddingEvaluator] = useState(false)
  const [evalError, setEvalError] = useState('')

  // Assignments
  const [assigning, setAssigning] = useState(false)
  const [assignResult, setAssignResult] = useState('')

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

  const fetchScoredCount = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/stats`)
      if (res.ok) {
        const data = await res.json()
        setScoredItemCount(data.scoredItemCount ?? 0)
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    }
  }, [projectId])

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function handleStatusChange() {
    const nextStatus = statusFlow[project.status]
    if (!nextStatus) return

    setStatusChanging(true)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      if (res.ok) {
        await fetchProject()
      }
    } catch (err) {
      console.error('Failed to change status:', err)
    } finally {
      setStatusChanging(false)
    }
  }

  async function handleAddEvaluator(e: React.FormEvent) {
    e.preventDefault()
    setEvalError('')
    setAddingEvaluator(true)

    try {
      // 1. Create user
      const userRes = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: evalEmail.trim(),
          name: evalName.trim() || null,
          password: evalPassword,
          role: 'EVALUATOR',
        }),
      })

      let userId: string

      if (userRes.ok) {
        const user = await userRes.json()
        userId = user.id
      } else if (userRes.status === 409) {
        // User already exists — look them up
        const usersRes = await fetch('/api/users')
        if (!usersRes.ok) throw new Error('Failed to fetch users')
        const allUsers = await usersRes.json()
        const existing = allUsers.find(
          (u: { email: string }) =>
            u.email.toLowerCase() === evalEmail.trim().toLowerCase()
        )
        if (!existing) throw new Error('User not found after conflict')
        userId = existing.id
      } else {
        const err = await userRes.json()
        setEvalError(err.error || 'Failed to create user')
        return
      }

      // 2. Assign to project
      const assignRes = await fetch(`/api/projects/${projectId}/evaluators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })

      if (assignRes.ok) {
        setEvalEmail('')
        setEvalName('')
        setEvalPassword('')
        setAddDialogOpen(false)
        await fetchEvaluators()
        await fetchProject()
      } else {
        const err = await assignRes.json()
        setEvalError(err.error || 'Failed to assign evaluator')
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
    window.open(
      `/api/export?projectId=${projectId}&type=${type}`,
      '_blank'
    )
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
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
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
            <Badge
              variant="outline"
              className={statusColors[project.status] || ''}
            >
              {project.status}
            </Badge>
          </div>
          {project.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {project.description}
            </p>
          )}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="evaluators">Evaluators</TabsTrigger>
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
                  <CardDescription>Evaluators</CardDescription>
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

              {statusFlow[project.status] && (
                <Button
                  onClick={handleStatusChange}
                  disabled={statusChanging}
                >
                  {statusChanging ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  )}
                  {statusActionLabel[project.status]}
                </Button>
              )}
            </div>
          </TabsContent>

          {/* ============== EVALUATORS TAB ============== */}
          <TabsContent value="evaluators" className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Evaluators</h2>
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

                <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                  <DialogTrigger render={<Button />}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Evaluator
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Evaluator</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleAddEvaluator} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="eval-email">Email</Label>
                        <Input
                          id="eval-email"
                          type="email"
                          value={evalEmail}
                          onChange={(e) => setEvalEmail(e.target.value)}
                          placeholder="evaluator@example.com"
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
                      <div className="space-y-2">
                        <Label htmlFor="eval-password">Password</Label>
                        <Input
                          id="eval-password"
                          type="password"
                          value={evalPassword}
                          onChange={(e) => setEvalPassword(e.target.value)}
                          placeholder="Temporary password"
                          required
                        />
                      </div>
                      {evalError && (
                        <p className="text-sm text-destructive">{evalError}</p>
                      )}
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setAddDialogOpen(false)
                            setEvalError('')
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          disabled={addingEvaluator || !evalEmail || !evalPassword}
                        >
                          {addingEvaluator ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Adding...
                            </>
                          ) : (
                            'Add Evaluator'
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
                No evaluators assigned to this project yet.
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

            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
