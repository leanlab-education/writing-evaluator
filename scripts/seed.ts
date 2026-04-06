import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { PrismaNeon } from '@prisma/adapter-neon'
import { hash } from 'bcryptjs'

async function main() {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
    console.error('ERROR: Seed script cannot run against production. Aborting.')
    process.exit(1)
  }

  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL!,
  })
  const prisma = new PrismaClient({ adapter })

  // Create admin user
  const hashedPassword = await hash('admin123', 12)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@leanlab.org' },
    update: {},
    create: {
      email: 'admin@leanlab.org',
      name: 'Admin',
      hashedPassword,
      role: 'ADMIN',
    },
  })
  console.log('Admin user created:', admin.email)

  // Create a test evaluator
  const evalPassword = await hash('eval123', 12)
  const evaluator = await prisma.user.upsert({
    where: { email: 'evaluator@test.com' },
    update: {},
    create: {
      email: 'evaluator@test.com',
      name: 'Test Evaluator',
      hashedPassword: evalPassword,
      role: 'EVALUATOR',
    },
  })
  console.log('Evaluator user created:', evaluator.email)

  await prisma.$disconnect()
}

main().catch(console.error)
