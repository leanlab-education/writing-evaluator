import { randomBytes } from 'crypto'
import { prisma } from './db'
import { AuthTokenType } from '@/generated/prisma/client'

const INVITE_EXPIRY_HOURS = 72
const RESET_EXPIRY_HOURS = 1

export async function createToken(email: string, type: AuthTokenType) {
  const token = randomBytes(32).toString('hex')
  const hours = type === 'INVITE' ? INVITE_EXPIRY_HOURS : RESET_EXPIRY_HOURS
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000)

  // Invalidate any existing unused tokens of the same type for this email
  await prisma.authToken.updateMany({
    where: { email, type, usedAt: null },
    data: { usedAt: new Date() },
  })

  const record = await prisma.authToken.create({
    data: { email, token, type, expiresAt },
  })

  return record.token
}

export async function verifyToken(token: string, type: AuthTokenType) {
  const record = await prisma.authToken.findUnique({ where: { token } })

  if (!record) return null
  if (record.type !== type) return null
  if (record.usedAt) return null
  if (record.expiresAt < new Date()) return null

  return record
}

export async function markTokenUsed(token: string) {
  await prisma.authToken.update({
    where: { token },
    data: { usedAt: new Date() },
  })
}
