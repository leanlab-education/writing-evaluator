import { auth } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { getReleaseUserSlotIndex, isSlotSplitRelease } from '@/lib/team-batch-releases'
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
          },
        },
      },
    }),
    prisma.projectEvaluator.findMany({
      where: { projectId },
      include: {
        user: { select: { id: true, name: true, email: true } },
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

  // Compute slot-adjusted assigned + completed counts per evaluator
  const [allBatchAssignments, scoredPairs] = await Promise.all([
    prisma.batchAssignment.findMany({
      where: { batch: { projectId } },
      include: {
        teamRelease: {
          include: {
            team: {
              include: {
                members: {
                  select: { userId: true },
                  orderBy: { user: { email: 'asc' } },
                },
              },
            },
          },
        },
        batch: { select: { id: true, isDoubleScored: true, type: true } },
      },
    }),
    prisma.score.findMany({
      where: { feedbackItem: { batch: { projectId } }, isReconciled: false },
      select: { userId: true, feedbackItemId: true },
      distinct: ['userId', 'feedbackItemId'],
    }),
  ])

  const completedByUser = new Map<string, number>()
  for (const { userId } of scoredPairs) {
    completedByUser.set(userId, (completedByUser.get(userId) ?? 0) + 1)
  }

  const basByUser = new Map<string, typeof allBatchAssignments>()
  for (const ba of allBatchAssignments) {
    const list = basByUser.get(ba.userId) ?? []
    list.push(ba)
    basByUser.set(ba.userId, list)
  }

  // One bulk count keyed by (batchId, slotIndex), replacing a per-batch count()
  // loop that produced O(users × batches) round-trips.
  const allBatchIds = Array.from(new Set(allBatchAssignments.map((ba) => ba.batch.id)))
  const itemSlotCounts =
    allBatchIds.length > 0
      ? await prisma.feedbackItem.groupBy({
          by: ['batchId', 'slotIndex'],
          where: { batchId: { in: allBatchIds } },
          _count: { _all: true },
        })
      : []
  const itemCountByBatchSlot = new Map<string, Map<number | null, number>>()
  for (const row of itemSlotCounts) {
    if (row.batchId === null) continue
    if (!itemCountByBatchSlot.has(row.batchId)) {
      itemCountByBatchSlot.set(row.batchId, new Map())
    }
    itemCountByBatchSlot.get(row.batchId)!.set(row.slotIndex, row._count._all)
  }

  const assignedByUser = new Map<string, number>()
  for (const [userId, bas] of basByUser) {
    let total = 0
    for (const ba of bas) {
      const releaseContext = ba.teamRelease
        ? {
            id: ba.teamRelease.id,
            scorerUserId: null,
            batch: { id: ba.batch.id, isDoubleScored: ba.batch.isDoubleScored, type: ba.batch.type },
            team: { members: ba.teamRelease.team.members.map((m) => ({ userId: m.userId })) },
          }
        : null
      const slotSplit = releaseContext ? isSlotSplitRelease(releaseContext) : false
      const userSlot = releaseContext && slotSplit ? getReleaseUserSlotIndex(releaseContext, userId) : null
      const slots = itemCountByBatchSlot.get(ba.batch.id)
      if (!slots) continue
      if (slotSplit && userSlot !== null) {
        total += slots.get(userSlot) ?? 0
      } else {
        for (const c of slots.values()) total += c
      }
    }
    assignedByUser.set(userId, total)
  }

  const latestScores = await prisma.score.findMany({
    where: { feedbackItem: { batch: { projectId } } },
    select: { userId: true, scoredAt: true },
    orderBy: { scoredAt: 'desc' },
    distinct: ['userId'],
  })
  const lastScoredByUser = new Map(latestScores.map((s) => [s.userId, s.scoredAt.toISOString()]))

  const teamMemberships = await prisma.evaluatorTeamMember.findMany({
    where: {
      userId: { in: evaluatorsRaw.map((ev) => ev.user.id) },
      team: { projectId },
    },
    include: { team: { select: { id: true, name: true } } },
  })
  const teamByUser = new Map(teamMemberships.map((m) => [m.userId, m.team]))

  const evaluators = evaluatorsRaw.map((ev) => ({
    id: ev.id,
    user: ev.user,
    assignedCount: assignedByUser.get(ev.user.id) ?? 0,
    completedCount: completedByUser.get(ev.user.id) ?? 0,
    lastScoredAt: lastScoredByUser.get(ev.user.id) ?? null,
    team: teamByUser.get(ev.user.id) ?? null,
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
