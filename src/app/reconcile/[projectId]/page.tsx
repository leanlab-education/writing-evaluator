import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { redirect } from 'next/navigation'
import { ReconcileClient } from './reconcile-client'

export default async function ReconcilePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>
  searchParams: Promise<{ batchId?: string; releaseId?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { projectId } = await params
  const { batchId, releaseId } = await searchParams

  if (!batchId || !releaseId) redirect('/')

  const release = await prisma.teamBatchRelease.findUnique({
    where: { id: releaseId },
    include: {
      batch: {
        select: { id: true, projectId: true, name: true },
      },
    },
  })

  if (
    !release ||
    release.batchId !== batchId ||
    release.batch.projectId !== projectId ||
    release.status !== 'RECONCILING'
  ) {
    redirect('/')
  }

  // Verify user is assigned to this release (or is admin)
  if (session.user.role !== 'ADMIN') {
    const assignment = await prisma.batchAssignment.findFirst({
      where: {
        batchId,
        userId: session.user.id,
        teamReleaseId: releaseId,
      },
    })
    if (!assignment) redirect('/')
  }

  return (
    <ReconcileClient
      projectId={projectId}
      batchId={batchId}
      releaseId={releaseId}
      batchName={release.batch.name}
      userName={session.user.name || session.user.email || 'Annotator'}
    />
  )
}
