import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createToken } from '@/lib/tokens'
import { sendInviteEmail } from '@/lib/email'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, name, projectId } = await request.json()

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const normalizedEmail = email.trim().toLowerCase()

  // Find or create user (no password)
  let user = await prisma.user.findUnique({ where: { email: normalizedEmail } })

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: name?.trim() || null,
        role: 'EVALUATOR',
      },
    })
  }

  // If projectId provided, assign to project
  if (projectId) {
    await prisma.projectEvaluator.upsert({
      where: { projectId_userId: { projectId, userId: user.id } },
      create: { projectId, userId: user.id },
      update: {},
    })
  }

  // Generate invite token and send email (only if user has no password)
  if (!user.hashedPassword) {
    const token = await createToken(normalizedEmail, 'INVITE')
    await sendInviteEmail(normalizedEmail, token, user.name)
  }

  return NextResponse.json({
    userId: user.id,
    invited: !user.hashedPassword,
    alreadyHasPassword: !!user.hashedPassword,
  }, { status: 201 })
}
