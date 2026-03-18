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

  // Get all scores for this project with full feedback item data
  const scores = await prisma.score.findMany({
    where: {
      feedbackItem: { projectId },
      isReconciled: type === 'reconciled',
    },
    include: {
      feedbackItem: {
        select: {
          feedbackId: true,
          responseId: true,
          studentId: true,
          cycleId: true,
          activityId: true,
          promptType: true,
          studentResponse: true,
          feedbackText: true,
          feedbackSource: true,
          annotatorId: true,
          batch: { select: { name: true } },
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
  let scoreCounter = 0
  const rowMap = new Map<
    string,
    {
      scoreId: string
      responseId: string | null
      feedbackId: string
      evaluatorEmail: string
      cycleId: string | null
      activityId: string | null
      promptType: string | null
      studentResponse: string
      feedbackText: string
      feedbackSource: string
      annotatorId: string | null
      batchName: string | null
      notes: string | null
      scoredAt: Date
      durationSeconds: number | null
      dimensionScores: Record<string, number>
    }
  >()

  for (const score of scores) {
    const rowKey = `${score.feedbackItemId}::${score.userId}`
    if (!rowMap.has(rowKey)) {
      scoreCounter++
      rowMap.set(rowKey, {
        scoreId: `S${String(scoreCounter).padStart(3, '0')}`,
        responseId: score.feedbackItem.responseId,
        feedbackId: score.feedbackItem.feedbackId,
        evaluatorEmail: score.user.email,
        cycleId: score.feedbackItem.cycleId,
        activityId: score.feedbackItem.activityId,
        promptType: score.feedbackItem.promptType,
        studentResponse: score.feedbackItem.studentResponse,
        feedbackText: score.feedbackItem.feedbackText,
        feedbackSource: score.feedbackItem.feedbackSource,
        annotatorId: score.feedbackItem.annotatorId,
        batchName: score.feedbackItem.batch?.name ?? null,
        notes: score.notes,
        scoredAt: score.scoredAt,
        durationSeconds: score.durationSeconds,
        dimensionScores: {},
      })
    }
    const row = rowMap.get(rowKey)!
    row.dimensionScores[score.dimension.key] = score.value
    if (score.notes) row.notes = score.notes
    if (score.durationSeconds) row.durationSeconds = score.durationSeconds
  }

  // Build CSV — L3 output format
  const dimensionKeys = dimensions.map((d: { key: string }) => d.key)
  const headerRow = [
    'Score_ID',
    'Response_ID',
    'Feedback_ID',
    'Evaluator_ID',
    'Cycle_ID',
    'Activity_ID',
    'Prompt_ID',
    ...dimensionKeys,
    'Notes',
    'Student_Text',
    'Feedback_Text',
    'Feedback_Source',
    'Annotator_ID',
    'Batch_Name',
    'Scored_At',
    'Duration_Seconds',
  ]

  const csvRows = [headerRow.join(',')]

  for (const row of rowMap.values()) {
    const values = [
      csvEscape(row.scoreId),
      csvEscape(row.responseId || ''),
      csvEscape(row.feedbackId),
      csvEscape(row.evaluatorEmail),
      csvEscape(row.cycleId || ''),
      csvEscape(row.activityId || ''),
      csvEscape(row.promptType || ''),
      ...dimensionKeys.map((key: string) =>
        row.dimensionScores[key] !== undefined
          ? String(row.dimensionScores[key])
          : ''
      ),
      csvEscape(row.notes || ''),
      csvEscape(row.studentResponse),
      csvEscape(row.feedbackText),
      row.feedbackSource,
      csvEscape(row.annotatorId || ''),
      csvEscape(row.batchName || ''),
      row.scoredAt.toISOString(),
      row.durationSeconds ? String(row.durationSeconds) : '',
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
