import { PrismaClient } from '../src/generated/prisma/client.js'
import { PrismaNeon } from '@prisma/adapter-neon'
import { randomBytes } from 'crypto'

const email = process.argv[2]
const name = process.argv[3] || null

if (!email) {
  console.error('Usage: npx tsx scripts/invite-admin.ts <email> [name]')
  process.exit(1)
}

async function main() {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! })
  const prisma = new PrismaClient({ adapter })

  const normalized = email.trim().toLowerCase()

  let user = await prisma.user.findUnique({ where: { email: normalized } })

  if (user?.hashedPassword) {
    console.log(`User ${normalized} already has an account (role: ${user.role}).`)
    await prisma.$disconnect()
    return
  }

  if (!user) {
    user = await prisma.user.create({
      data: { email: normalized, name, role: 'ADMIN' },
    })
    console.log(`Created ADMIN user: ${normalized}`)
  } else {
    await prisma.user.update({
      where: { email: normalized },
      data: { role: 'ADMIN' },
    })
    console.log(`Updated ${normalized} to ADMIN role`)
  }

  // Create invite token
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000)

  await prisma.authToken.updateMany({
    where: { email: normalized, type: 'INVITE', usedAt: null },
    data: { usedAt: new Date() },
  })

  await prisma.authToken.create({
    data: { email: normalized, token, type: 'INVITE', expiresAt },
  })

  const appUrl = process.env.APP_URL || 'http://localhost:3333'
  console.log(`\nInvite link (expires in 72h):\n${appUrl}/invite/${token}`)

  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
