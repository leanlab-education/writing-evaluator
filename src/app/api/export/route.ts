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
  const format = request.nextUrl.searchParams.get('format') // 'irr' for IRR comparison
  const activityId = request.nextUrl.searchParams.get('activityId')
  const conjunctionId = request.nextUrl.searchParams.get('conjunctionId')

  if (!projectId) {
    return NextResponse.json(
      { error: 'projectId is required' },
      { status: 400 }
    )
  }

  if (type !== 'original' && type !== 'reconciled' && type !== 'discrepancies') {
    return NextResponse.json(
      { error: 'type must be "original", "reconciled", or "discrepancies"' },
      { status: 400 }
    )
  }

  // Discrepancy export requires a batchId
  const batchId = request.nextUrl.searchParams.get('batchId')
  if (type === 'discrepancies' && !batchId) {
    return NextResponse.json(
      { error: 'batchId is required for discrepancy export' },
      { status: 400 }
    )
  }

  if (type === 'discrepancies') {
    return handleDiscrepancyExport(projectId, batchId!)
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
      feedbackItem: {
        projectId,
        ...(activityId ? { activityId } : {}),
        ...(conjunctionId ? { conjunctionId } : {}),
      },
      isReconciled: type === 'reconciled',
    },
    include: {
      feedbackItem: {
        select: {
          responseId: true,
          studentId: true,
          cycleId: true,
          activityId: true,
          conjunctionId: true,
          studentText: true,
          feedbackSource: true,
          teacherId: true,
          feedbackText: true,
          optimal: true,
          feedbackType: true,
          feedbackId: true,
          batchId: true,
          batch: {
            select: { name: true, type: true },
          },
        },
      },
      user: {
        select: { email: true, id: true },
      },
      dimension: {
        select: { key: true },
      },
    },
    orderBy: [{ feedbackItemId: 'asc' }, { userId: 'asc' }],
  })

  // Look up team membership and batch assignment roles
  const teamMemberships = await prisma.evaluatorTeamMember.findMany({
    where: { team: { projectId } },
    include: {
      team: { select: { name: true } },
    },
  })

  const teamByUserId = new Map<string, string>()
  for (const tm of teamMemberships) {
    teamByUserId.set(tm.userId, tm.team.name)
  }

  const batchAssignments = await prisma.batchAssignment.findMany({
    where: { batch: { projectId } },
  })

  // Map (batchId, userId) → scoringRole
  const roleMap = new Map<string, string>()
  for (const ba of batchAssignments) {
    roleMap.set(`${ba.batchId}::${ba.userId}`, ba.scoringRole)
  }

  // Group scores by (feedbackItemId + userId) to build wide-format rows
  let scoreCounter = 0
  const rowMap = new Map<
    string,
    {
      scoreId: string
      responseId: string | null
      studentId: string
      cycleId: string | null
      activityId: string | null
      conjunctionId: string | null
      studentText: string
      feedbackSource: string
      teacherId: string | null
      feedbackText: string
      optimal: string | null
      feedbackType: string | null
      feedbackId: string
      evaluatorEmail: string
      scoringRole: string
      teamName: string
      batchName: string
      batchType: string
      dimensionScores: Record<string, number>
    }
  >()

  for (const score of scores) {
    const rowKey = `${score.feedbackItemId}::${score.userId}`
    if (!rowMap.has(rowKey)) {
      scoreCounter++
      const batchId = score.feedbackItem.batchId
      const userId = score.user.id
      const scoringRole =
        batchId ? roleMap.get(`${batchId}::${userId}`) || '' : ''

      rowMap.set(rowKey, {
        scoreId: `S${String(scoreCounter).padStart(3, '0')}`,
        responseId: score.feedbackItem.responseId,
        studentId: score.feedbackItem.studentId,
        cycleId: score.feedbackItem.cycleId,
        activityId: score.feedbackItem.activityId,
        conjunctionId: score.feedbackItem.conjunctionId,
        studentText: score.feedbackItem.studentText,
        feedbackSource: score.feedbackItem.feedbackSource,
        teacherId: score.feedbackItem.teacherId,
        feedbackText: score.feedbackItem.feedbackText,
        optimal: score.feedbackItem.optimal,
        feedbackType: score.feedbackItem.feedbackType,
        feedbackId: score.feedbackItem.feedbackId,
        evaluatorEmail: score.user.email,
        scoringRole,
        teamName: teamByUserId.get(userId) || '',
        batchName: score.feedbackItem.batch?.name || '',
        batchType: score.feedbackItem.batch?.type || '',
        dimensionScores: {},
      })
    }
    const row = rowMap.get(rowKey)!
    row.dimensionScores[score.dimension.key] = score.value
  }

  // Build CSV — new output format: input columns + Score_ID, Evaluator_ID, criteria
  const dimensionKeys = dimensions.map((d) => d.key)
  const dimensionLabels = dimensions.map((d) => d.label)

  const headerRow = [
    'Response_ID',
    'Student_ID',
    'Cycle_ID',
    'Activity_ID',
    'Conjunction_ID',
    'Student_Text',
    'Feedback_Source',
    'Teacher_ID',
    'Feedback_Text',
    'optimal',
    'feedback_type',
    'Feedback_ID',
    'Score_ID',
    'Evaluator_Email',
    'Scoring_Role',
    'Team_Name',
    'Batch_Name',
    'Batch_Type',
    ...dimensionLabels,
  ]

  const csvRows = [headerRow.join(',')]

  for (const row of rowMap.values()) {
    const values = [
      csvEscape(row.responseId || ''),
      csvEscape(row.studentId),
      csvEscape(row.cycleId || ''),
      csvEscape(row.activityId || ''),
      csvEscape(row.conjunctionId || ''),
      csvEscape(row.studentText),
      row.feedbackSource,
      csvEscape(row.teacherId || ''),
      csvEscape(row.feedbackText),
      csvEscape(row.optimal || ''),
      csvEscape(row.feedbackType || ''),
      csvEscape(row.feedbackId),
      csvEscape(row.scoreId),
      csvEscape(row.evaluatorEmail),
      csvEscape(row.scoringRole),
      csvEscape(row.teamName),
      csvEscape(row.batchName),
      csvEscape(row.batchType),
      ...dimensionKeys.map((key) =>
        row.dimensionScores[key] !== undefined
          ? String(row.dimensionScores[key])
          : ''
      ),
    ]
    csvRows.push(values.join(','))
  }

  const csv = csvRows.join('\n')
  const filterParts = [type]
  if (activityId) filterParts.push(`activity-${activityId}`)
  if (conjunctionId) filterParts.push(`conj-${conjunctionId}`)
  const filename = `scores-${filterParts.join('-')}-${new Date().toISOString().split('T')[0]}.csv`

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

async function handleDiscrepancyExport(projectId: string, batchId: string) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { name: true, projectId: true },
  })

  if (!batch || batch.projectId !== projectId) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  }

  // Fetch all original scores for this batch
  const scores = await prisma.score.findMany({
    where: {
      feedbackItem: { batchId },
      isReconciled: false,
    },
    include: {
      feedbackItem: {
        select: {
          responseId: true,
          studentId: true,
          activityId: true,
          conjunctionId: true,
          feedbackId: true,
        },
      },
      user: { select: { email: true } },
      dimension: { select: { key: true, label: true } },
    },
  })

  // Group by (feedbackItemId, dimensionId) and find discrepancies
  const groups = new Map<
    string,
    {
      feedbackItem: (typeof scores)[0]['feedbackItem']
      dimension: (typeof scores)[0]['dimension']
      evaluators: { email: string; value: number }[]
    }
  >()

  for (const score of scores) {
    const key = `${score.feedbackItemId}::${score.dimensionId}`
    if (!groups.has(key)) {
      groups.set(key, {
        feedbackItem: score.feedbackItem,
        dimension: score.dimension,
        evaluators: [],
      })
    }
    groups.get(key)!.evaluators.push({
      email: score.user.email,
      value: score.value,
    })
  }

  const headerRow = [
    'Response_ID',
    'Student_ID',
    'Activity_ID',
    'Conjunction_ID',
    'Feedback_ID',
    'Dimension_Key',
    'Dimension_Label',
    'Evaluator_A_Email',
    'Evaluator_A_Score',
    'Evaluator_B_Email',
    'Evaluator_B_Score',
    'Difference',
  ]

  const csvRows = [headerRow.join(',')]

  for (const [, group] of groups) {
    const evals = group.evaluators
    if (evals.length !== 2) continue
    if (evals[0].value === evals[1].value) continue

    csvRows.push(
      [
        csvEscape(group.feedbackItem.responseId || ''),
        csvEscape(group.feedbackItem.studentId),
        csvEscape(group.feedbackItem.activityId || ''),
        csvEscape(group.feedbackItem.conjunctionId || ''),
        csvEscape(group.feedbackItem.feedbackId),
        csvEscape(group.dimension.key),
        csvEscape(group.dimension.label),
        csvEscape(evals[0].email),
        String(evals[0].value),
        csvEscape(evals[1].email),
        String(evals[1].value),
        String(Math.abs(evals[0].value - evals[1].value)),
      ].join(',')
    )
  }

  const csv = csvRows.join('\n')
  const safeBatchName = (batch.name || 'batch').replace(/[^a-zA-Z0-9_-]/g, '-')
  const filename = `discrepancies-${safeBatchName}-${new Date().toISOString().split('T')[0]}.csv`

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

function csvEscape(value: string): string {
  // Defend against CSV formula injection — prefix dangerous leading characters
  if (/^[=+\-@\t\r]/.test(value)) {
    value = `'${value}`
  }
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
