import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { redirect } from 'next/navigation'
import { EvaluatorProjectPage } from './evaluator-project-page'
import { countForAssignment, loadSlotMaps } from '@/lib/evaluator-stats'

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role === 'ADMIN') redirect('/admin')

  const { projectId } = await params

  // Verify this evaluator belongs to the project
  const projectEvaluator = await prisma.projectEvaluator.findUnique({
    where: { projectId_userId: { projectId, userId: session.user.id } },
    include: { project: { select: { id: true, name: true, description: true } } },
  })
  if (!projectEvaluator) redirect('/')

  // Fetch batch assignments for this user + project
  const batchAssignments = await prisma.batchAssignment.findMany({
    where: {
      userId: session.user.id,
      OR: [{ teamReleaseId: null }, { teamRelease: { isVisible: true } }],
      batch: { projectId, isHidden: false },
    },
    include: {
      teamRelease: {
        include: {
          team: {
            include: {
              members: { select: { userId: true }, orderBy: { user: { email: 'asc' } } },
              dimensions: { select: { dimensionId: true } },
            },
          },
        },
      },
      batch: {
        include: {
          _count: { select: { feedbackItems: true } },
          project: { select: { id: true } },
        },
      },
    },
  })

  const { itemCountByBatchSlot, scoredCountByBatchSlot } = await loadSlotMaps(
    batchAssignments.map((ba) => ba.batch.id),
    session.user.id
  )

  const batches = batchAssignments.map((ba) => {
    const itemCount = countForAssignment(ba, session.user.id, itemCountByBatchSlot)
    const scoredCount = scoredCountByBatchSlot
      ? countForAssignment(ba, session.user.id, scoredCountByBatchSlot)
      : 0
    const releaseStatus = ba.teamRelease?.status ?? ba.batch.status
    const releaseId = ba.teamReleaseId ?? null
    return {
      id: ba.batch.id,
      releaseId,
      name: ba.batch.name,
      status: releaseStatus,
      itemCount,
      scoredCount,
    }
  })

  return (
    <EvaluatorProjectPage
      project={projectEvaluator.project}
      batches={batches}
      userName={session.user.name || session.user.email || 'Annotator'}
    />
  )
}
