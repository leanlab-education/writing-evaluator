import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { ImportClient } from './import-client'

export default async function ImportPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/')

  const { projectId } = await params

  return <ImportClient projectId={projectId} />
}
