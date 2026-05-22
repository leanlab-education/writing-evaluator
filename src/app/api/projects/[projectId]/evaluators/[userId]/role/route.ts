import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canAdminProject } from '@/lib/authorization'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; userId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { projectId, userId } = await params

  if (!(await canAdminProject(session.user.id, session.user.role, projectId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { role } = body as { role?: string }

  if (role !== 'EVALUATOR' && role !== 'PROJECT_ADMIN') {
    return NextResponse.json(
      { error: 'role must be EVALUATOR or PROJECT_ADMIN' },
      { status: 400 }
    )
  }

  const pe = await prisma.projectEvaluator.findUnique({
    where: { projectId_userId: { projectId, userId } },
  })

  if (!pe) {
    return NextResponse.json(
      { error: 'User is not assigned to this project' },
      { status: 404 }
    )
  }

  const updated = await prisma.projectEvaluator.update({
    where: { id: pe.id },
    data: { role },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  })

  return NextResponse.json(updated)
}
