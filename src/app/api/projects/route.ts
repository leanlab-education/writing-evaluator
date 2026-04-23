import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { DEFAULT_RUBRIC } from '@/lib/rubric-templates'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const projects = await prisma.project.findMany({
    include: {
      _count: {
        select: {
          feedbackItems: true,
          evaluators: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(projects)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { name, description } = body

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const project = await prisma.project.create({
    data: {
      name,
      description: description || null,
      rubric: {
        create: DEFAULT_RUBRIC.map((dim, index) => ({
          key: dim.key,
          label: dim.label,
          description: dim.description,
          sortOrder: index,
          scaleMin: dim.scaleMin,
          scaleMax: dim.scaleMax,
          scoreLabelJson: JSON.stringify(dim.scoreLabels),
          guidanceJson: JSON.stringify(dim.guidance),
        })),
      },
    },
    include: {
      rubric: { orderBy: { sortOrder: 'asc' } },
    },
  })

  return NextResponse.json(project, { status: 201 })
}
