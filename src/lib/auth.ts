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
    const { payload } = await jwtVerify(token, key)

    // Verify email matches
    if (payload.email !== email) return null

    return {
      email: payload.email as string,
      name: payload.name as string | undefined,
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
      const isApiRoute = pathname.startsWith('/api/')

      if (isApiRoute) return true
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
  },
})
