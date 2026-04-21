import { prisma } from '@/lib/db'

interface ReleaseWithContext {
  id: string
  scorerUserId: string | null
  batch?: {
    id: string
    isDoubleScored: boolean
    type?: string
  }
  isDoubleScored?: boolean
  batchType?: string
  status?: string
  team: {
    members: {
      userId: string
    }[]
    dimensions?: {
      dimensionId: string
    }[]
  }
}

export function getExpectedReleaseUserIds(release: ReleaseWithContext): string[] {
  const batchType = release.batch?.type ?? release.batchType
  const isDoubleScored = release.batch?.isDoubleScored ?? release.isDoubleScored

  if (batchType === 'TRAINING') {
    return release.team.members.map((member) => member.userId)
  }

  if (isDoubleScored) {
    return release.team.members.map((member) => member.userId)
  }

  return release.scorerUserId ? [release.scorerUserId] : []
}

export function releaseNeedsReconciliation(release: ReleaseWithContext): boolean {
  const batchType = release.batch?.type ?? release.batchType
  const isDoubleScored = release.batch?.isDoubleScored ?? release.isDoubleScored

  return batchType === 'TRAINING' || Boolean(isDoubleScored)
}

export function getExpectedReleaseDimensionIds(
  release: ReleaseWithContext,
  projectDimensionIds: string[]
): string[] {
  const batchType = release.batch?.type ?? release.batchType

  if (batchType === 'TRAINING') {
    return projectDimensionIds
  }

  return release.team.dimensions?.map((dimension) => dimension.dimensionId) ?? []
}

export function getReleaseOwnerUserId(release: ReleaseWithContext): string | null {
  return release.team.members[0]?.userId ?? null
}

export async function syncBatchStatus(batchId: string) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      teamReleases: {
        select: {
          status: true,
        },
      },
    },
  })

  if (!batch) {
    return null
  }

  const statuses = batch.teamReleases.map((release) => release.status)
  const nextStatus =
    statuses.length === 0
      ? 'DRAFT'
      : statuses.every((status) => status === 'COMPLETE')
        ? 'COMPLETE'
        : statuses.some((status) => status === 'RECONCILING')
          ? 'RECONCILING'
          : statuses.some((status) => status === 'SCORING')
            ? 'SCORING'
            : 'DRAFT'

  return prisma.batch.update({
    where: { id: batchId },
    data: {
      status: nextStatus,
      isAssigned: statuses.some((status) => status !== 'DRAFT'),
    },
  })
}

export async function syncBatchAssignmentsForRelease(releaseId: string) {
  const release = await prisma.teamBatchRelease.findUnique({
    where: { id: releaseId },
    include: {
      batch: {
        select: {
          id: true,
          isDoubleScored: true,
          type: true,
        },
      },
      team: {
        include: {
          members: {
            select: {
              userId: true,
            },
            orderBy: {
              user: { email: 'asc' },
            },
          },
          dimensions: {
            select: {
              dimensionId: true,
            },
          },
        },
      },
    },
  })

  if (!release) {
    throw new Error('Release not found')
  }

  const userIds = getExpectedReleaseUserIds(release)

  await prisma.$transaction(async (tx) => {
    await tx.batchAssignment.deleteMany({
      where: { teamReleaseId: releaseId },
    })

    if (userIds.length === 0) {
      return
    }

    await tx.batchAssignment.createMany({
      data: userIds.map((userId, index) => ({
        batchId: release.batch.id,
        userId,
        teamReleaseId: releaseId,
        scoringRole:
          release.batch.isDoubleScored && index > 0 ? 'DOUBLE' : 'PRIMARY',
      })),
      skipDuplicates: true,
    })

    await tx.batch.update({
      where: { id: release.batch.id },
      data: { isAssigned: true },
    })
  })

  await syncBatchStatus(release.batch.id)
}
