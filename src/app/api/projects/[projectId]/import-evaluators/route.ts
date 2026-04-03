import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { fetchStudyFlowParticipants } from '@/lib/studyflow-client'
import { NextRequest, NextResponse } from 'next/server'

// GET: fetch participants from StudyFlow for preview
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { projectId } = await params
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { studyflowStudyId: true },
  })

  if (!project?.studyflowStudyId) {
    return NextResponse.json(
      { error: 'No StudyFlow study linked to this project' },
      { status: 400 }
    )
  }

  try {
    const participants = await fetchStudyFlowParticipants(project.studyflowStudyId)

    // Check which emails already exist as evaluators on this project
    const existingEvaluators = await prisma.projectEvaluator.findMany({
      where: { projectId },
      include: { user: { select: { email: true } } },
    })
    const existingEmails = new Set(existingEvaluators.map((e) => e.user.email))

    const result = participants.map((p) => ({
      ...p,
      alreadyImported: existingEmails.has(p.email),
    }))

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch participants'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

// POST: import selected participants as evaluators
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { projectId } = await params
  const { participants } = await request.json()

  if (!Array.isArray(participants) || participants.length === 0) {
    return NextResponse.json({ error: 'No participants selected' }, { status: 400 })
  }

  let imported = 0

  for (const p of participants) {
    const email = p.email.trim().toLowerCase()
    const name = [p.firstName, p.lastName].filter(Boolean).join(' ') || null

    // Find or create user (no password — they'll use StudyFlow magic link)
    let user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      user = await prisma.user.create({
        data: { email, name, role: 'EVALUATOR' },
      })
    }

    // Assign to project (skip if already assigned)
    await prisma.projectEvaluator.upsert({
      where: { projectId_userId: { projectId, userId: user.id } },
      create: { projectId, userId: user.id },
      update: {},
    })

    imported++
  }

  return NextResponse.json({ imported, total: participants.length }, { status: 201 })
}
