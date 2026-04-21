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
  team: {
    members: {
      userId: string
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
}
