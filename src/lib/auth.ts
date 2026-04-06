import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { jwtVerify } from 'jose'
import { prisma } from './db'

async function verifyStudyFlowToken(token: string, email: string) {
  const secret = process.env.STUDYFLOW_LINK_SECRET
  if (!secret) return null

  try {
    const key = new TextEncoder().encode(secret)
    const { payload } = await jwtVerify(token, key, {
      maxTokenAge: '10m', // Reject tokens older than 10 minutes even if exp is far out
      issuer: 'studyflow',
      audience: 'writing-evaluator',
    })

    // Require an expiration claim — reject tokens without one
    if (!payload.exp) return null

    // Verify email matches
    if (payload.email !== email) return null

    return {
      email: payload.email as string,
      name: payload.name as string | undefined,
      projectId: payload.project_id as string | undefined,
      studyId: payload.study_id as string | undefined,
    }
  } catch {
    return null
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        studyflow_token: { label: 'StudyFlow Token', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null

        const email = (credentials.email as string).trim().toLowerCase()

        // StudyFlow magic link flow
        if (credentials.studyflow_token) {
          const verified = await verifyStudyFlowToken(
            credentials.studyflow_token as string,
            email
          )
          if (!verified) return null

          // Find or create user
          let user = await prisma.user.findUnique({ where: { email } })
          if (!user) {
            user = await prisma.user.create({
              data: {
                email,
                name: verified.name || null,
                role: 'EVALUATOR',
              },
            })
          }

          // Auto-assign to project(s) linked to StudyFlow
          // Try direct project_id from JWT first, then fall back to all StudyFlow-linked projects
          if (verified.projectId) {
            const project = await prisma.project.findUnique({
              where: { id: verified.projectId },
            })
            if (project) {
              await prisma.projectEvaluator.upsert({
                where: {
                  projectId_userId: { projectId: project.id, userId: user.id },
                },
                create: { projectId: project.id, userId: user.id },
                update: {},
              })
            }
          } else if (verified.studyId) {
            // No project_id but has study_id — assign to projects linked to this specific study
            const studyflowProjects = await prisma.project.findMany({
              where: { studyflowStudyId: verified.studyId },
              select: { id: true },
            })
            for (const project of studyflowProjects) {
              await prisma.projectEvaluator.upsert({
                where: {
                  projectId_userId: { projectId: project.id, userId: user.id },
                },
                create: { projectId: project.id, userId: user.id },
                update: {},
              })
            }
          }

          return { id: user.id, email: user.email, name: user.name, role: user.role }
        }

        // Standard password flow
        if (!credentials.password) return null

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user?.hashedPassword) return null

        const isValid = await compare(credentials.password as string, user.hashedPassword)
        if (!isValid) return null

        return { id: user.id, email: user.email, name: user.name, role: user.role }
      },
    }),
  ],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user
      const { pathname } = request.nextUrl
      const isPublicPage =
        pathname === '/login' ||
        pathname.startsWith('/invite/') ||
        pathname.startsWith('/reset-password')

      // Public API routes that don't require authentication
      const isPublicApiRoute =
        pathname.startsWith('/api/auth/') ||
        pathname === '/api/invite/accept' ||
        pathname === '/api/reset-password' ||
        pathname === '/api/reset-password/accept'

      if (isPublicApiRoute) return true
      if (pathname === '/login' && isLoggedIn) {
        return Response.redirect(new URL('/', request.url))
      }
      if (!isLoggedIn && !isPublicPage) return false

      return true
    },
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role
        token.id = user.id
      }
      return token
    },
    session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string
        session.user.id = token.id as string
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
  },
})
