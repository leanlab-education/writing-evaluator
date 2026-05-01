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

  // Group batch assignments by projectId
  const batchesByProject = new Map<
    string,
    { id: string; name: string; status: string; itemCount: number; scoredCount: number }[]
  >()

  for (const ba of batchAssignments) {
    const pid = ba.batch.project.id
    if (!batchesByProject.has(pid)) batchesByProject.set(pid, [])

    // For slot-split batches, the user is only responsible for half the items.
    // Match `src/app/page.tsx` so the dashboard and any client refresh agree.
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

    const itemFilter =
      slotSplit && userSlot !== null
        ? { batchId: ba.batch.id, slotIndex: userSlot }
        : { batchId: ba.batch.id }

    const itemCount = await prisma.feedbackItem.count({ where: itemFilter })
    const scoredCount = await prisma.feedbackItem.count({
      where: {
        ...itemFilter,
        scores: { some: { userId: session.user.id } },
      },
    })

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
      teamName: string
      criteria: string[]
      partnerName: string | null
    }
  >()

  for (const tm of teamMemberships) {
    const partner = tm.team.members
      .filter((m) => m.userId !== session.user!.id)
      .map((m) => m.user.name || m.user.email)[0] || null

    teamByProject.set(tm.team.projectId, {
      teamName: tm.team.name,
      criteria: tm.team.dimensions.map((d) => d.dimension.label),
      partnerName: partner,
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
