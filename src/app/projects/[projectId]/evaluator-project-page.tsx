'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ArrowLeft, Layers } from 'lucide-react'
import { AppShell } from '@/components/app-shell'

interface BatchInfo {
  id: string
  releaseId: string | null
  name: string
  status: string
  itemCount: number
  scoredCount: number
}

interface Project {
  id: string
  name: string
  description: string | null
}

export function EvaluatorProjectPage({
  project,
  batches,
  userName,
}: {
  project: Project
  batches: BatchInfo[]
  userName: string
}) {
  const router = useRouter()

  const totalItems = batches.reduce((sum, b) => sum + b.itemCount, 0)
  const totalScored = batches.reduce((sum, b) => sum + b.scoredCount, 0)
  const overallPct = totalItems > 0 ? Math.round((totalScored / totalItems) * 100) : 0

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6">
          <button
            onClick={() => router.push('/')}
            className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            My Projects
          </button>
          <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
          {project.description && (
            <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
          )}
          {totalItems > 0 && (
            <div className="mt-4 flex items-center gap-3">
              <Progress value={overallPct} className="flex-1" />
              <span className="text-sm text-muted-foreground">
                {totalScored}/{totalItems} scored
              </span>
            </div>
          )}
        </div>

        {batches.length === 0 ? (
          <div className="py-12 text-center">
            <Layers className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-medium">No batches assigned</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              You haven&apos;t been assigned to any batches yet. Check back soon.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {batches.map((batch) => {
              const batchPct =
                batch.itemCount > 0
                  ? Math.round((batch.scoredCount / batch.itemCount) * 100)
                  : 0
              const batchComplete = batchPct === 100
              const isScoring = batch.status === 'SCORING'
              const isReconciling = batch.status === 'RECONCILING'

              return (
                <Card key={batch.id} className="transition-all duration-200 hover:shadow-sm hover:ring-1 hover:ring-primary/10">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base">{batch.name}</CardTitle>
                      <Badge
                        variant="outline"
                        className={
                          batchComplete
                            ? 'bg-status-complete-bg text-status-complete-text'
                            : isScoring
                              ? 'bg-status-active-bg text-status-active-text'
                              : 'text-muted-foreground'
                        }
                      >
                        {batchComplete ? 'Complete' : isReconciling ? 'Reconciling' : isScoring ? 'Open' : 'Not Open'}
                      </Badge>
                    </div>
                    <CardDescription>
                      {batch.scoredCount} of {batch.itemCount} items scored
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <Progress value={batchPct} className="flex-1" />
                      {isReconciling ? (
                        <Button
                          size="sm"
                          onClick={() =>
                            router.push(
                              `/reconcile/${project.id}?batchId=${batch.id}&releaseId=${batch.releaseId}`
                            )
                          }
                        >
                          Reconcile
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant={batchComplete ? 'outline' : 'default'}
                          disabled={!isScoring || batchComplete}
                          onClick={() =>
                            router.push(`/evaluate/${project.id}?batchId=${batch.id}`)
                          }
                        >
                          {batchComplete
                            ? 'Done'
                            : !isScoring
                              ? 'Not Open'
                              : batch.scoredCount > 0
                                ? 'Continue'
                                : 'Start'}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}
