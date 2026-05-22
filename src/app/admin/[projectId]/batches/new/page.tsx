import { auth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { notFound, redirect } from 'next/navigation'
import { BatchBuilderPage } from '@/components/batch-builder-page'
import { canAdminProject } from '@/lib/authorization'

export default async function NewBatchPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { projectId } = await params
  if (!(await canAdminProject(session.user.id, session.user.role, projectId))) redirect('/')

  const [project, items] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
      },
    }),
    prisma.feedbackItem.findMany({
      where: { projectId },
      select: {
        feedbackId: true,
        activityId: true,
        conjunctionId: true,
        batch: {
          select: {
            name: true,
          },
        },
      },
    }),
  ])

  if (!project) notFound()

  return (
    <BatchBuilderPage
      projectId={project.id}
      projectName={project.name}
      items={items}
    />
  )
}
