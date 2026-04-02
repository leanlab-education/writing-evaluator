import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/my-team?projectId=xxx — get the current evaluator's team for a project
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const projectId = request.nextUrl.searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json(
      { error: 'projectId is required' },
      { status: 400 }
    )
  }

  const membership = await prisma.evaluatorTeamMember.findFirst({
    where: {
      userId: session.user.id,
      team: { projectId },
    },
    include: {
      team: {
        include: {
          dimensions: {
            include: {
              dimension: {
                select: { id: true, key: true, label: true, sortOrder: true },
              },
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

  if (!membership) {
    // No team assignment — evaluator might be in a calibration-only role
    // or teams haven't been set up yet
    return NextResponse.json(null)
  }

  return NextResponse.json({
    teamId: membership.team.id,
    teamName: membership.team.name,
    dimensionIds: membership.team.dimensions.map((d) => d.dimension.id),
    dimensions: membership.team.dimensions.map((d) => d.dimension),
    partner: membership.team.members
      .filter((m) => m.userId !== session.user!.id)
      .map((m) => m.user)[0] || null,
  })
}
