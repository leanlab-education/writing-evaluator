'use client'

import { useState, useSyncExternalStore } from 'react'
import { AppSidebar, type ProjectContext } from '@/components/app-sidebar'
import { PanelLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

const STORAGE_KEY = 'sidebar-collapsed'

interface AppShellProps {
  children: React.ReactNode
  defaultCollapsed?: boolean
  projectContext?: ProjectContext
}

const emptySubscribe = () => () => {}

export function AppShell({ children, defaultCollapsed, projectContext }: AppShellProps) {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)

  const [collapsed, setCollapsed] = useState(() => {
    if (defaultCollapsed !== undefined) return defaultCollapsed
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored !== null) return stored === 'true'
    }
    return false
  })
  const [mobileOpen, setMobileOpen] = useState(false)

  function handleToggle() {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(STORAGE_KEY, String(next))
  }

  // Prevent layout flash before hydration
  if (!mounted) {
    return (
      <div className="flex min-h-screen bg-background">
        <div className={`hidden lg:block ${defaultCollapsed ? 'w-14' : 'w-60'}`} />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <div className="sticky top-0 h-screen">
          <AppSidebar collapsed={collapsed} onToggle={handleToggle} projectContext={projectContext} />
        </div>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 lg:hidden">
            <AppSidebar collapsed={false} onToggle={() => setMobileOpen(false)} projectContext={projectContext} />
          </div>
        </>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {/* Mobile top bar */}
        <div className="sticky top-0 z-30 flex h-14 items-center border-b border-border bg-background/80 px-4 backdrop-blur-lg lg:hidden">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setMobileOpen(true)}
          >
            <PanelLeft className="size-4" />
          </Button>
          <span className="ml-3 text-sm font-semibold tracking-tight text-foreground">
            Writing Evaluator
          </span>
        </div>
        {children}
      </main>
    </div>
  )
}
