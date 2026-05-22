import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { redirect } from 'next/navigation'
import { EvaluateClient } from './evaluate-client'
import { canAdminProject } from '@/lib/authorization'

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

  const isAdmin = await canAdminProject(session.user.id, session.user.role, projectId)

  if (!isAdmin) {
    if (batchId) {
      const batch = await prisma.batch.findUnique({
        where: { id: batchId },
        select: {
          projectId: true,
          isHidden: true,
          assignments: {
            where: {
              userId: session.user.id,
              OR: [
                { teamReleaseId: null },
                { teamRelease: { isVisible: true, status: 'SCORING' } },
              ],
            },
            select: {
              id: true,
              teamRelease: {
                select: { status: true },
              },
            },
          },
        },
      })
      if (
        !batch ||
        batch.projectId !== projectId ||
        batch.isHidden ||
        batch.assignments.length === 0
      ) {
        redirect('/')
      }
    } else {
      const scorableBatch = await prisma.batchAssignment.findFirst({
        where: {
          userId: session.user.id,
          OR: [
            { teamReleaseId: null, batch: { status: 'SCORING' } },
            { teamRelease: { isVisible: true, status: 'SCORING' } },
          ],
          batch: {
            projectId,
            isHidden: false,
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
