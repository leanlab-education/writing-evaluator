import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { redirect } from 'next/navigation'
import { EvaluateClient } from './evaluate-client'

export default async function EvaluatePage({
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

  // Non-admins: verify they have a scorable batch in this project
  if (session.user.role !== 'ADMIN') {
    if (batchId) {
      // Check the specific batch is open for scoring
      const batch = await prisma.batch.findUnique({
        where: { id: batchId },
        select: { status: true, projectId: true },
      })
      if (!batch || batch.projectId !== projectId || (batch.status !== 'SCORING' && batch.status !== 'RECONCILING')) {
        redirect('/')
      }
    } else {
      // Check user has at least one scorable batch in this project
      const scorableBatch = await prisma.batchAssignment.findFirst({
        where: {
          userId: session.user.id,
          batch: {
            projectId,
            status: { in: ['SCORING', 'RECONCILING'] },
          },
        },
      })
      if (!scorableBatch) {
        redirect('/')
      }
    }
  }

  // Look up batch type if a batchId is provided
  let batchType: string | undefined
  if (batchId) {
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      select: { type: true },
    })
    batchType = batch?.type ?? undefined
  }

  return (
    <EvaluateClient
      projectId={projectId}
      userName={session.user.name || session.user.email || 'Evaluator'}
      batchId={batchId}
      batchType={batchType}
    />
  )
}
