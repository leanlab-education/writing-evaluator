import { auth } from '@/lib/auth'
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

  return (
    <EvaluateClient
      projectId={projectId}
      userName={session.user.name || session.user.email || 'Evaluator'}
      batchId={batchId}
    />
  )
}
