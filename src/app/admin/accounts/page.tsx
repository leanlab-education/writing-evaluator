import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { AppShell } from '@/components/app-shell'
import { TeamClient } from './team-client'

export default async function TeamPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/')

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      hashedPassword: true,
      createdAt: true,
    },
    orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
  })

  const serialized = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    hasAccount: !!u.hashedPassword,
    createdAt: u.createdAt.toISOString(),
  }))

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
        <TeamClient users={serialized} />
      </div>
    </AppShell>
  )
}
