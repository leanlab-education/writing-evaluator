import { prisma } from './db'

export async function canAdminProject(
  userId: string,
  globalRole: string,
  projectId: string
): Promise<boolean> {
  if (globalRole === 'ADMIN') return true

  const pe = await prisma.projectEvaluator.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  })

  return pe?.role === 'PROJECT_ADMIN'
}

export function isGlobalAdmin(globalRole: string): boolean {
  return globalRole === 'ADMIN'
}

export async function getAdminProjectIds(userId: string): Promise<string[]> {
  const rows = await prisma.projectEvaluator.findMany({
    where: { userId, role: 'PROJECT_ADMIN' },
    select: { projectId: true },
  })
  return rows.map((r) => r.projectId)
}
