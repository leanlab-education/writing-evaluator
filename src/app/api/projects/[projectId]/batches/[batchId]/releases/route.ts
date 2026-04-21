import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { syncBatchAssignmentsForRelease } from '@/lib/team-batch-releases'
import { NextResponse } from 'next/server'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; batchId: string }> }
) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { projectId, batchId } = await params
  const body = await request.json()
  const {
    teamId,
    isVisible = false,
    scorerUserId,
  } = body as {
    teamId?: string
    isVisible?: boolean
    scorerUserId?: string | null
  }

  if (!teamId) {
    return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
  }

  const [batch, team] = await Promise.all([
    prisma.batch.findUnique({
      where: { id: batchId },
      select: {
        id: true,
        projectId: true,
        type: true,
        isDoubleScored: true,
        status: true,
      },
    }),
    prisma.evaluatorTeam.findUnique({
      where: { id: teamId },
      include: {
        members: {
          select: { userId: true },
        },
      },
    }),
  ])

  if (!batch || batch.projectId !== projectId) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  }

  if (!team || team.projectId !== projectId) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 })
  }

  if (batch.status === 'COMPLETE') {
    return NextResponse.json(
      { error: 'Cannot change team releases on a completed batch' },
      { status: 400 }
    )
  }

  if (batch.type === 'REGULAR' && !batch.isDoubleScored) {
    if (!scorerUserId) {
      return NextResponse.json(
        { error: 'A scorer must be selected for non-double-scored batches' },
        { status: 400 }
      )
    }

    const belongsToTeam = team.members.some(
      (member) => member.userId === scorerUserId
    )
    if (!belongsToTeam) {
      return NextResponse.json(
        { error: 'Selected scorer must be a member of this team' },
        { status: 400 }
      )
    }
  }

  const release = await prisma.teamBatchRelease.create({
    data: {
      batchId,
      teamId,
      isVisible,
      scorerUserId:
        batch.type === 'TRAINING'
          ? null
          : batch.isDoubleScored
            ? null
            : (scorerUserId ?? null),
    },
  })

  await syncBatchAssignmentsForRelease(release.id)

  if (isVisible && batch.status === 'DRAFT') {
    await prisma.batch.update({
      where: { id: batchId },
      data: { status: 'SCORING' },
    })
  }

  return NextResponse.json(release, { status: 201 })
}
