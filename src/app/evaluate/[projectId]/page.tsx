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

  // Non-admins: verify they have a scorable batch in this project and
  // that the batch hasn't been hidden by an admin.
  if (session.user.role !== 'ADMIN') {
    if (batchId) {
      const batch = await prisma.batch.findUnique({
        where: { id: batchId },
        select: {
          status: true,
          projectId: true,
          isHidden: true,
          assignments: {
            where: {
              userId: session.user.id,
              OR: [
                { teamReleaseId: null },
                { teamRelease: { isVisible: true } },
              ],
            },
            select: { id: true },
          },
        },
      })
      if (
        !batch ||
        batch.projectId !== projectId ||
        batch.isHidden ||
        batch.assignments.length === 0 ||
        (batch.status !== 'SCORING' && batch.status !== 'RECONCILING')
      ) {
        redirect('/')
      }
    } else {
      const scorableBatch = await prisma.batchAssignment.findFirst({
        where: {
          userId: session.user.id,
          OR: [{ teamReleaseId: null }, { teamRelease: { isVisible: true } }],
          batch: {
            projectId,
            isHidden: false,
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
      userName={session.user.name || session.user.email || 'Annotator'}
      batchId={batchId}
      batchType={batchType}
    />
  )
}
