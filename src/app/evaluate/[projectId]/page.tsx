import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { EvaluateClient } from './evaluate-client'

export default async function EvaluatePage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const { projectId } = await params

  return (
    <EvaluateClient
      projectId={projectId}
      userName={session.user.name || session.user.email || 'Evaluator'}
    />
  )
}
