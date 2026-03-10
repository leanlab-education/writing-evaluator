import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { ProjectDetailClient } from '@/components/project-detail-client'

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/')

  const { projectId } = await params

  // Fetch all data in parallel
  const [project, evaluatorsRaw, scoredItems] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      include: {
        rubric: { orderBy: { sortOrder: 'asc' } },
        _count: {
          select: {
            feedbackItems: true,
            evaluators: true,
            assignments: true,
          },
        },
      },
    }),
    prisma.projectEvaluator.findMany({
      where: { projectId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { assignments: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.score.findMany({
      where: {
        feedbackItem: { projectId },
        isReconciled: false,
      },
      select: { feedbackItemId: true },
      distinct: ['feedbackItemId'],
    }),
  ])

  if (!project) notFound()

  // Get completed assignment counts per evaluator
  const completedCounts = await prisma.assignment.groupBy({
    by: ['evaluatorId'],
    where: {
      projectId,
      status: 'COMPLETE',
    },
    _count: { id: true },
  })

  const completedMap = new Map(
    completedCounts.map((c) => [c.evaluatorId, c._count.id])
  )

  const evaluators = evaluatorsRaw.map((ev) => ({
    id: ev.id,
    userId: ev.userId,
    user: ev.user,
    _count: ev._count,
    completedCount: completedMap.get(ev.id) || 0,
  }))

  // Serialize dates for client component
  const serializedProject = {
    ...project,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  }

  return (
    <ProjectDetailClient
      initialProject={serializedProject}
      initialEvaluators={evaluators}
      initialScoredItemCount={scoredItems.length}
    />
  )
}
