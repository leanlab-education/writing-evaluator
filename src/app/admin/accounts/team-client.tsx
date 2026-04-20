'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Loader2, Plus, Check, ShieldCheck, UserCheck } from 'lucide-react'

interface User {
  id: string
  name: string | null
  email: string
  role: string
  hasAccount: boolean
  createdAt: string
}

interface Props {
  users: User[]
}

export function TeamClient({ users }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'ADMIN' | 'EVALUATOR'>('EVALUATOR')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const admins = users.filter((u) => u.role === 'ADMIN')
  const evaluators = users.filter((u) => u.role === 'EVALUATOR')

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSending(true)

    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || null,
          role,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setEmail('')
        setName('')
        setRole('EVALUATOR')
        if (data.invited) {
          setSuccess('Invitation email sent!')
        } else if (data.alreadyHasPassword) {
          setSuccess('User already has an account.')
        }
        router.refresh()
        setTimeout(() => {
          setOpen(false)
          setSuccess('')
        }, 1500)
      } else {
        const err = await res.json()
        setError(err.error || 'Failed to send invite')
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Manage admins and evaluators. Invited users set their own password.
          </p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); setError(''); setSuccess('') }}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-2 h-4 w-4" />
            Invite
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="space-y-2">
                <Label>Role</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={role === 'EVALUATOR' ? 'default' : 'outline'}
                    onClick={() => setRole('EVALUATOR')}
                  >
                    <UserCheck className="mr-1.5 h-3.5 w-3.5" />
                    Evaluator
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={role === 'ADMIN' ? 'default' : 'outline'}
                    onClick={() => setRole('ADMIN')}
                  >
                    <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                    Admin
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="amber@leanlabeducation.org"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-name">
                  Name <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="invite-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Amber Wang"
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              {success && (
                <p className="flex items-center gap-1.5 text-sm text-success">
                  <Check className="h-3.5 w-3.5" />
                  {success}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={sending || !email.trim()}>
                  {sending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send Invite'
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Admins */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Admins ({admins.length})
        </h2>
        <div className="mt-2 rounded-md border border-border">
          {admins.map((user, idx) => (
            <div
              key={user.id}
              className={`flex items-center gap-3 px-3 py-2.5 ${idx > 0 ? 'border-t border-border' : ''}`}
            >
              <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium">
                  {user.name || user.email}
                </span>
                {user.name && (
                  <span className="ml-2 text-xs text-muted-foreground">{user.email}</span>
                )}
              </div>
              {user.hasAccount ? (
                <Badge variant="outline" className="text-[10px] text-success border-success/30">
                  Active
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  Invited
                </Badge>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Evaluators */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Evaluators ({evaluators.length})
        </h2>
        {evaluators.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No evaluators yet. Invite them from here or from a project&apos;s Evaluators tab.
          </p>
        ) : (
          <div className="mt-2 rounded-md border border-border">
            {evaluators.map((user, idx) => (
              <div
                key={user.id}
                className={`flex items-center gap-3 px-3 py-2.5 ${idx > 0 ? 'border-t border-border' : ''}`}
              >
                <UserCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium">
                    {user.name || user.email}
                  </span>
                  {user.name && (
                    <span className="ml-2 text-xs text-muted-foreground">{user.email}</span>
                  )}
                </div>
                {user.hasAccount ? (
                  <Badge variant="outline" className="text-[10px] text-success border-success/30">
                    Active
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    Invited
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
