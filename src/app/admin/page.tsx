import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileText, Users, Plus } from 'lucide-react'
import { CreateProjectDialog } from '@/components/create-project-dialog'

const statusColors: Record<string, string> = {
  SETUP: 'bg-yellow-100 text-yellow-800',
  ACTIVE: 'bg-green-100 text-green-800',
  RECONCILIATION: 'bg-blue-100 text-blue-800',
  COMPLETE: 'bg-gray-100 text-gray-800',
}

export default async function AdminDashboard() {
  const session = await auth()
  if (!session?.user) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/')

  const projects = await prisma.project.findMany({
    include: {
      _count: {
        select: {
          feedbackItems: true,
          evaluators: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
            <p className="text-sm text-muted-foreground">
              Manage your writing evaluation projects
            </p>
          </div>
          <CreateProjectDialog />
        </div>

        {projects.length === 0 ? (
          <div className="mt-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-medium">No projects yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first evaluation project to get started.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/admin/${project.id}`}
                className="block"
              >
                <Card className="cursor-pointer transition-shadow hover:shadow-md">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">
                        {project.name}
                      </CardTitle>
                      <Badge
                        variant="outline"
                        className={statusColors[project.status] || ''}
                      >
                        {project.status}
                      </Badge>
                    </div>
                    {project.description && (
                      <CardDescription className="line-clamp-2">
                        {project.description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" />
                        {project._count.feedbackItems} items
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {project._count.evaluators} evaluators
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Created{' '}
                      {project.createdAt.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
