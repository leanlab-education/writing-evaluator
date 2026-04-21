import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { syncBatchAssignmentsForRelease } from '@/lib/team-batch-releases'
import { NextRequest, NextResponse } from 'next/server'

async function getReleaseContext(releaseId: string) {
  return prisma.teamBatchRelease.findUnique({
    where: { id: releaseId },
    include: {
      batch: {
        select: {
          id: true,
          projectId: true,
          type: true,
          isDoubleScored: true,
          status: true,
        },
      },
      team: {
        include: {
          members: {
            select: { userId: true },
          },
          dimensions: {
            select: { dimensionId: true },
          },
        },
      },
    },
  })
}

async function hasReleaseScores(releaseId: string) {
  const release = await getReleaseContext(releaseId)
  if (!release) return false

  const teamUserIds = release.team.members.map((member) => member.userId)
  const dimensionIds = release.team.dimensions.map(
    (dimension) => dimension.dimensionId
  )

  const scoreCount = await prisma.score.count({
    where: {
      feedbackItem: { batchId: release.batchId },
      userId: { in: teamUserIds },
      dimensionId: { in: dimensionIds },
      isReconciled: false,
    },
  })

  return scoreCount > 0
}

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ projectId: string; batchId: string; releaseId: string }>
  }
) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { projectId, batchId, releaseId } = await params
  const body = await request.json()
  const { isVisible, scorerUserId } = body as {
    isVisible?: boolean
    scorerUserId?: string | null
  }

  const release = await getReleaseContext(releaseId)
  if (
    !release ||
    release.batch.projectId !== projectId ||
    release.batchId !== batchId
  ) {
    return NextResponse.json({ error: 'Release not found' }, { status: 404 })
  }

  if (release.batch.status === 'COMPLETE') {
    return NextResponse.json(
      { error: 'Cannot change a release on a completed batch' },
      { status: 400 }
    )
  }

  if (
    release.batch.type === 'REGULAR' &&
    !release.batch.isDoubleScored &&
    scorerUserId !== undefined
  ) {
    if (!scorerUserId) {
      return NextResponse.json(
        { error: 'A scorer must be selected for non-double-scored batches' },
        { status: 400 }
      )
    }

    const belongsToTeam = release.team.members.some(
      (member) => member.userId === scorerUserId
    )
    if (!belongsToTeam) {
      return NextResponse.json(
        { error: 'Selected scorer must be a member of this team' },
        { status: 400 }
      )
    }

    if (scorerUserId !== release.scorerUserId && (await hasReleaseScores(releaseId))) {
      return NextResponse.json(
        { error: 'Cannot change the scorer after scoring has begun for this team' },
        { status: 400 }
      )
    }
  }

  const updated = await prisma.teamBatchRelease.update({
    where: { id: releaseId },
    data: {
      ...(isVisible !== undefined ? { isVisible } : {}),
      ...(release.batch.type === 'TRAINING' || release.batch.isDoubleScored
        ? {}
        : scorerUserId !== undefined
          ? { scorerUserId }
          : {}),
    },
  })

  await syncBatchAssignmentsForRelease(releaseId)

  if (updated.isVisible && release.batch.status === 'DRAFT') {
    await prisma.batch.update({
      where: { id: batchId },
      data: { status: 'SCORING' },
    })
  }

  return NextResponse.json(updated)
}

export async function DELETE(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ projectId: string; batchId: string; releaseId: string }>
  }
) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { projectId, batchId, releaseId } = await params
  const release = await getReleaseContext(releaseId)
  if (
    !release ||
    release.batch.projectId !== projectId ||
    release.batchId !== batchId
  ) {
    return NextResponse.json({ error: 'Release not found' }, { status: 404 })
  }

  if (await hasReleaseScores(releaseId)) {
    return NextResponse.json(
      { error: 'Cannot remove a team release after scoring has begun' },
      { status: 400 }
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.batchAssignment.deleteMany({
      where: { teamReleaseId: releaseId },
    })
    await tx.teamBatchRelease.delete({
      where: { id: releaseId },
    })
  })

  return NextResponse.json({ success: true })
}
