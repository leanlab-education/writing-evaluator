'use client'

import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { LogOut } from 'lucide-react'

export function NavHeader() {
  const { data: session } = useSession()

  const homeHref = session?.user?.role === 'ADMIN' ? '/admin' : '/'

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href={homeHref}
          className="text-base font-semibold tracking-tight text-foreground transition-colors hover:text-primary"
        >
          Writing Evaluator
        </Link>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {session?.user?.email && (
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {session.user.email}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            <LogOut className="mr-1.5 size-3.5" />
            Sign Out
          </Button>
        </div>
      </div>
    </header>
  )
}
