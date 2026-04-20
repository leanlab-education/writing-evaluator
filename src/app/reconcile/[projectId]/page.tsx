import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { redirect } from 'next/navigation'
import { ReconcileClient } from './reconcile-client'

export default async function ReconcilePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>
  searchParams: Promise<{ batchId?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { projectId } = await params
  const { batchId } = await searchParams

  if (!batchId) redirect('/')

  // Verify the batch is in RECONCILING state and belongs to this project
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { status: true, projectId: true, name: true },
  })

  if (!batch || batch.projectId !== projectId || batch.status !== 'RECONCILING') {
    redirect('/')
  }

  // Verify user is assigned to this batch (or is admin)
  if (session.user.role !== 'ADMIN') {
    const assignment = await prisma.batchAssignment.findUnique({
      where: { batchId_userId: { batchId, userId: session.user.id } },
    })
    if (!assignment) redirect('/')
  }

  return (
    <ReconcileClient
      projectId={projectId}
      batchId={batchId}
      batchName={batch.name}
      userName={session.user.name || session.user.email || 'Annotator'}
    />
  )
}
