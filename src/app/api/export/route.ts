import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const projectId = request.nextUrl.searchParams.get('projectId')
  const type = request.nextUrl.searchParams.get('type') || 'original'

  if (!projectId) {
    return NextResponse.json(
      { error: 'projectId is required' },
      { status: 400 }
    )
  }

  if (type !== 'original' && type !== 'reconciled') {
    return NextResponse.json(
      { error: 'type must be "original" or "reconciled"' },
      { status: 400 }
    )
  }

  // Get rubric dimensions for column headers
  const dimensions = await prisma.rubricDimension.findMany({
    where: { projectId },
    orderBy: { sortOrder: 'asc' },
  })

  if (dimensions.length === 0) {
    return NextResponse.json(
      { error: 'No rubric dimensions found for this project' },
      { status: 404 }
    )
  }

  // Get all scores for this project
  const scores = await prisma.score.findMany({
    where: {
      feedbackItem: { projectId },
      isReconciled: type === 'reconciled',
    },
    include: {
      feedbackItem: {
        select: {
          feedbackId: true,
          feedbackSource: true,
        },
      },
      user: {
        select: { email: true },
      },
      dimension: {
        select: { key: true },
      },
    },
    orderBy: [{ feedbackItemId: 'asc' }, { userId: 'asc' }],
  })

  // Group scores by (feedbackItemId + userId) to build wide-format rows
  const rowMap = new Map<
    string,
    {
      feedbackId: string
      evaluatorEmail: string
      feedbackSource: string
      notes: string | null
      scoredAt: Date
      dimensionScores: Record<string, number>
    }
  >()

  for (const score of scores) {
    const rowKey = `${score.feedbackItemId}::${score.userId}`
    if (!rowMap.has(rowKey)) {
      rowMap.set(rowKey, {
        feedbackId: score.feedbackItem.feedbackId,
        evaluatorEmail: score.user.email,
        feedbackSource: score.feedbackItem.feedbackSource,
        notes: score.notes,
        scoredAt: score.scoredAt,
        dimensionScores: {},
      })
    }
    const row = rowMap.get(rowKey)!
    row.dimensionScores[score.dimension.key] = score.value
    // Use the latest notes if present
    if (score.notes) {
      row.notes = score.notes
    }
  }

  // Build CSV
  const dimensionKeys = dimensions.map((d: { key: string }) => d.key)
  const headerRow = [
    'feedback_ID',
    'evaluator_email',
    ...dimensionKeys,
    'notes',
    'feedback_source',
    'timestamp',
  ]

  const csvRows = [headerRow.join(',')]

  for (const row of rowMap.values()) {
    const values = [
      csvEscape(row.feedbackId),
      csvEscape(row.evaluatorEmail),
      ...dimensionKeys.map((key: string) =>
        row.dimensionScores[key] !== undefined
          ? String(row.dimensionScores[key])
          : ''
      ),
      csvEscape(row.notes || ''),
      row.feedbackSource,
      row.scoredAt.toISOString(),
    ]
    csvRows.push(values.join(','))
  }

  const csv = csvRows.join('\n')
  const filename = `scores-${type}-${new Date().toISOString().split('T')[0]}.csv`

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
