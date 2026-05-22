import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ImportClient } from './import-client'
import { canAdminProject } from '@/lib/authorization'

export default async function ImportPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { projectId } = await params
  if (!(await canAdminProject(session.user.id, session.user.role, projectId))) redirect('/')

  return <ImportClient projectId={projectId} />
}
