import { prisma } from '@/lib/db'
import { verifyToken, markTokenUsed } from '@/lib/tokens'
import { hash } from 'bcryptjs'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { token, password } = await request.json()

  if (!token || !password) {
    return NextResponse.json({ error: 'Token and password are required' }, { status: 400 })
  }

  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }

  const record = await verifyToken(token, 'RESET')
  if (!record) {
    return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 })
  }

  const hashedPassword = await hash(password, 12)

  await prisma.user.update({
    where: { email: record.email },
    data: { hashedPassword },
  })

  await markTokenUsed(token)

  return NextResponse.json({ success: true })
}
