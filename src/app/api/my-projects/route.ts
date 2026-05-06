import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getReleaseUserSlotIndex, isSlotSplitRelease } from '@/lib/team-batch-releases'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const evaluatorProjects = await prisma.projectEvaluator.findMany({
    where: { userId: session.user.id },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          description: true,
          status: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Get batch assignments for this user — skip admin-hidden batches
  // so the Double-before-Independent release workflow works.
  const batchAssignments = await prisma.batchAssignment.findMany({
    where: {
      userId: session.user.id,
      OR: [{ teamReleaseId: null }, { teamRelease: { isVisible: true } }],
      batch: { isHidden: false },
    },
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
      batch: {
        include: {
          project: { select: { id: true } },
        },
      },
    },
  })

  // One bulk groupBy of items by (batchId, slotIndex), and one of scored items
  // (joined to scores by this user). Replaces 2 count() calls per batch.
  const allBatchIds = Array.from(new Set(batchAssignments.map((ba) => ba.batch.id)))
  const [itemSlotCounts, scoredItems] = await Promise.all([
    allBatchIds.length > 0
      ? prisma.feedbackItem.groupBy({
          by: ['batchId', 'slotIndex'],
          where: { batchId: { in: allBatchIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    allBatchIds.length > 0
      ? prisma.feedbackItem.findMany({
          where: {
            batchId: { in: allBatchIds },
            scores: { some: { userId: session.user.id } },
          },
          select: { batchId: true, slotIndex: true },
        })
      : Promise.resolve([]),
  ])
  const itemCountByBatchSlot = new Map<string, Map<number | null, number>>()
  for (const row of itemSlotCounts) {
    if (row.batchId === null) continue
    if (!itemCountByBatchSlot.has(row.batchId)) {
      itemCountByBatchSlot.set(row.batchId, new Map())
    }
    itemCountByBatchSlot.get(row.batchId)!.set(row.slotIndex, row._count._all)
  }
  const scoredCountByBatchSlot = new Map<string, Map<number | null, number>>()
  for (const item of scoredItems) {
    if (item.batchId === null) continue
    if (!scoredCountByBatchSlot.has(item.batchId)) {
      scoredCountByBatchSlot.set(item.batchId, new Map())
    }
    const slotMap = scoredCountByBatchSlot.get(item.batchId)!
    slotMap.set(item.slotIndex, (slotMap.get(item.slotIndex) ?? 0) + 1)
  }

  // Group batch assignments by projectId
  const batchesByProject = new Map<
    string,
    { id: string; name: string; status: string; itemCount: number; scoredCount: number }[]
  >()

  for (const ba of batchAssignments) {
    const pid = ba.batch.project.id
    if (!batchesByProject.has(pid)) batchesByProject.set(pid, [])

    const releaseContext = ba.teamRelease
      ? {
          id: ba.teamRelease.id,
          scorerUserId: null,
          batch: {
            id: ba.batch.id,
            isDoubleScored: ba.batch.isDoubleScored,
            type: ba.batch.type,
          },
          team: {
            members: ba.teamRelease.team.members.map((m) => ({
              userId: m.userId,
            })),
          },
        }
      : null
    const slotSplit = releaseContext ? isSlotSplitRelease(releaseContext) : false
    const userSlot =
      releaseContext && slotSplit
        ? getReleaseUserSlotIndex(releaseContext, session.user.id)
        : null

    const itemSlots = itemCountByBatchSlot.get(ba.batch.id)
    const scoredSlots = scoredCountByBatchSlot.get(ba.batch.id)
    let itemCount = 0
    let scoredCount = 0
    if (itemSlots) {
      if (slotSplit && userSlot !== null) {
        itemCount = itemSlots.get(userSlot) ?? 0
      } else {
        for (const c of itemSlots.values()) itemCount += c
      }
    }
    if (scoredSlots) {
      if (slotSplit && userSlot !== null) {
        scoredCount = scoredSlots.get(userSlot) ?? 0
      } else {
        for (const c of scoredSlots.values()) scoredCount += c
      }
    }

    batchesByProject.get(pid)!.push({
      id: ba.batch.id,
      name: ba.batch.name,
      status: ba.batch.status,
      itemCount,
      scoredCount,
    })
  }

  // Get team memberships for this user across all projects
  const teamMemberships = await prisma.evaluatorTeamMember.findMany({
    where: { userId: session.user.id },
    include: {
      team: {
        include: {
          dimensions: {
            include: {
              dimension: { select: { label: true } },
            },
            orderBy: { dimension: { sortOrder: 'asc' } },
          },
          members: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      },
    },
  })

  const teamByProject = new Map<
    string,
    {
      teamId: string
      criteria: string[]
      partnerId: string | null
    }
  >()

  for (const tm of teamMemberships) {
    const partnerId = tm.team.members
      .filter((m) => m.userId !== session.user!.id)
      .map((m) => m.userId)[0] || null

    teamByProject.set(tm.team.projectId, {
      teamId: tm.team.id,
      criteria: tm.team.dimensions.map((d) => d.dimension.label),
      partnerId,
    })
  }

  const result = evaluatorProjects.map((ep) => {
    const batches = batchesByProject.get(ep.projectId) || []
    const assignmentCount = batches.reduce((sum, b) => sum + b.itemCount, 0)
    const completedCount = batches.reduce((sum, b) => sum + b.scoredCount, 0)
    return {
      id: ep.id,
      projectId: ep.projectId,
      project: ep.project,
      assignmentCount,
      completedCount,
      batches,
      team: teamByProject.get(ep.projectId) || null,
    }
  })

  return NextResponse.json(result)
}
