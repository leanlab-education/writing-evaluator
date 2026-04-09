import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AdjudicateClient } from './adjudicate-client'

export default async function AdjudicatePage() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login?callbackUrl=/adjudicate')
  }
  return <AdjudicateClient userName={session.user.name || session.user.email || ''} />
}
