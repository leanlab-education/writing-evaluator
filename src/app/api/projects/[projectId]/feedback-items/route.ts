import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth()
  if (!session?.user) return new Response('Unauthorized', { status: 401 })
  if (session.user.role !== 'ADMIN')
    return new Response('Forbidden', { status: 403 })

  const { projectId } = await params
  const url = new URL(req.url)

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)
  const limit = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50)
  )
  const activityId = url.searchParams.get('activityId') || ''
  const conjunctionId = url.searchParams.get('conjunctionId') || ''
  const batched = url.searchParams.get('batched')

  const where: Record<string, unknown> = { projectId }
  if (activityId) where.activityId = activityId
  if (conjunctionId) where.conjunctionId = conjunctionId
  if (batched === 'true') where.batchId = { not: null }
  if (batched === 'false') where.batchId = null

  const [items, total, allForFilters, unassignedTotal] = await Promise.all([
    prisma.feedbackItem.findMany({
      where,
      select: {
        id: true,
        feedbackId: true,
        activityId: true,
        conjunctionId: true,
        batchId: true,
        batch: {
          select: { id: true, name: true, type: true, status: true },
        },
      },
      orderBy: [
        { activityId: 'asc' },
        { conjunctionId: 'asc' },
        { feedbackId: 'asc' },
      ],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.feedbackItem.count({ where }),
    prisma.feedbackItem.findMany({
      where: { projectId },
      select: { activityId: true, conjunctionId: true },
    }),
    prisma.feedbackItem.count({ where: { projectId, batchId: null } }),
  ])

  const activityIds = [
    ...new Set(
      allForFilters
        .map((i) => i.activityId)
        .filter((v): v is string => Boolean(v))
    ),
  ].sort()
  const conjunctionIds = [
    ...new Set(
      allForFilters
        .map((i) => i.conjunctionId)
        .filter((v): v is string => Boolean(v))
    ),
  ].sort()

  return Response.json({
    items,
    total,
    page,
    limit,
    unassignedTotal,
    filterOptions: { activityIds, conjunctionIds },
  })
}
