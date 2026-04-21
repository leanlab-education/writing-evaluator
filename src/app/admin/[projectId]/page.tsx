import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { ProjectDetailClient } from '@/components/project-detail-client'

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/')

  const { projectId } = await params
  const { tab } = await searchParams

  // Fetch all data in parallel
  const [project, evaluatorsRaw, scoredItems, feedbackItemsResult, feedbackItemsCount, unassignedCount, allItemsForFilters] = await Promise.all([
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
    prisma.feedbackItem.findMany({
      where: { projectId },
      select: {
        id: true,
        feedbackId: true,
        activityId: true,
        conjunctionId: true,
        batchId: true,
        batch: { select: { id: true, name: true, type: true, status: true } },
      },
      orderBy: [
        { activityId: 'asc' },
        { conjunctionId: 'asc' },
        { feedbackId: 'asc' },
      ],
      take: 50,
    }),
    prisma.feedbackItem.count({ where: { projectId } }),
    prisma.feedbackItem.count({ where: { projectId, batchId: null } }),
    prisma.feedbackItem.findMany({
      where: { projectId },
      select: { activityId: true, conjunctionId: true },
    }),
  ])

  const activityIds = [
    ...new Set(
      allItemsForFilters
        .map((i) => i.activityId)
        .filter((v): v is string => Boolean(v))
    ),
  ].sort()
  const conjunctionIds = [
    ...new Set(
      allItemsForFilters
        .map((i) => i.conjunctionId)
        .filter((v): v is string => Boolean(v))
    ),
  ].sort()

  const initialFeedbackItemsData = {
    items: feedbackItemsResult,
    total: feedbackItemsCount,
    unassignedTotal: unassignedCount,
    filterOptions: { activityIds, conjunctionIds },
  }

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
      initialFeedbackItemsData={initialFeedbackItemsData}
      initialActiveTab={tab === 'batches' ? 'batches' : 'overview'}
    />
  )
}
