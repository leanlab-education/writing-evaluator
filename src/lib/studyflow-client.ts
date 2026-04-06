import { SignJWT, jwtVerify } from 'jose'

export interface StudyFlowParticipant {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  role: string
  status: string
}

function getSecret() {
  const secret = process.env.STUDYFLOW_LINK_SECRET
  if (!secret) throw new Error('STUDYFLOW_LINK_SECRET is not configured')
  return new TextEncoder().encode(secret)
}

function getApiUrl() {
  const url = process.env.STUDYFLOW_API_URL
  if (!url) throw new Error('STUDYFLOW_API_URL is not configured')
  return url.replace(/\/$/, '') // strip trailing slash
}

async function signRequest(studyId: string): Promise<string> {
  return new SignJWT({ study_id: studyId, purpose: 'fetch_participants' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30s')
    .sign(getSecret())
}

export async function fetchStudyFlowParticipants(studyId: string): Promise<StudyFlowParticipant[]> {
  // Validate studyId to prevent path traversal
  if (!/^[a-zA-Z0-9_-]+$/.test(studyId)) {
    throw new Error('Invalid studyId format')
  }

  const token = await signRequest(studyId)
  const url = `${getApiUrl()}/api/studies/${studyId}/participants`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error')
    throw new Error(`StudyFlow API error (${res.status}): ${text}`)
  }

  const data = await res.json()

  // Normalize the response — StudyFlow returns participants with nested user objects
  const participants: StudyFlowParticipant[] = (data.participants || data || []).map(
    (p: Record<string, unknown>) => ({
      id: p.id || p.user_id,
      email: (p as Record<string, Record<string, unknown>>).user?.email || p.email,
      firstName: (p as Record<string, Record<string, unknown>>).user?.first_name || p.first_name || null,
      lastName: (p as Record<string, Record<string, unknown>>).user?.last_name || p.last_name || null,
      role: p.role || 'participant',
      status: p.status || 'active',
    })
  )

  // Only return active participants (ICA signed, account created)
  return participants.filter((p) => p.status === 'active')
}

// Re-export for verifying incoming magic link tokens (used in auth.ts via jose directly)
export { jwtVerify, SignJWT }
