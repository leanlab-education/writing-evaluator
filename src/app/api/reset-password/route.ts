import { prisma } from '@/lib/db'
import { createToken } from '@/lib/tokens'
import { sendResetEmail } from '@/lib/email'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { email } = await request.json()

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const normalizedEmail = email.trim().toLowerCase()

  // Always return success to prevent email enumeration
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })

  if (user) {
    const token = await createToken(normalizedEmail, 'RESET')
    await sendResetEmail(normalizedEmail, token)
  }

  return NextResponse.json({ success: true })
}
