import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { redirect } from 'next/navigation'
import { EvaluateClient } from './evaluate-client'

export default async function EvaluatePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>
  searchParams: Promise<{ batchId?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { projectId } = await params
  const { batchId } = await searchParams

  // Non-admins can only access ACTIVE projects
  if (session.user.role !== 'ADMIN') {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { status: true },
    })
    if (!project || project.status !== 'ACTIVE') {
      redirect('/')
    }
  }

  return (
    <EvaluateClient
      projectId={projectId}
      userName={session.user.name || session.user.email || 'Evaluator'}
      batchId={batchId}
    />
  )
}
