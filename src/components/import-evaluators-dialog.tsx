'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Loader2, Download, CheckCircle } from 'lucide-react'

interface Participant {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  role: string
  status: string
  alreadyImported: boolean
}

interface ImportEvaluatorsDialogProps {
  projectId: string
  onImported: () => void
}

export function ImportEvaluatorsDialog({ projectId, onImported }: ImportEvaluatorsDialogProps) {
  const [open, setOpen] = useState(false)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ imported: number } | null>(null)

  async function fetchParticipants() {
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const res = await fetch(`/api/projects/${projectId}/import-evaluators`)
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to fetch participants')
        return
      }

      const data: Participant[] = await res.json()
      setParticipants(data)

      // Pre-select all non-imported participants
      const importable = data.filter((p) => !p.alreadyImported).map((p) => p.id)
      setSelected(new Set(importable))
    } catch {
      setError('Failed to connect to StudyFlow')
    } finally {
      setLoading(false)
    }
  }

  async function handleImport() {
    const toImport = participants.filter(
      (p) => selected.has(p.id) && !p.alreadyImported
    )
    if (toImport.length === 0) return

    setImporting(true)
    setError('')

    try {
      const res = await fetch(`/api/projects/${projectId}/import-evaluators`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participants: toImport }),
      })

      if (res.ok) {
        const data = await res.json()
        setResult(data)
        onImported()
      } else {
        const data = await res.json()
        setError(data.error || 'Import failed')
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setImporting(false)
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    const importable = participants.filter((p) => !p.alreadyImported)
    if (selected.size === importable.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(importable.map((p) => p.id)))
    }
  }

  const importableCount = participants.filter(
    (p) => selected.has(p.id) && !p.alreadyImported
  ).length

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (v) fetchParticipants()
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <Download className="mr-2 h-4 w-4" />
        Import from StudyFlow
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Evaluators from StudyFlow</DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              Fetching participants...
            </span>
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {result && (
          <div className="flex flex-col items-center gap-2 py-6">
            <CheckCircle className="size-8 text-success" />
            <p className="text-sm font-medium">
              Imported {result.imported} evaluator{result.imported !== 1 ? 's' : ''}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
          </div>
        )}

        {!loading && !result && participants.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={
                    selected.size ===
                    participants.filter((p) => !p.alreadyImported).length
                  }
                  onChange={toggleAll}
                  className="rounded"
                />
                Select all
              </label>
              <span className="text-xs text-muted-foreground">
                {participants.length} participant{participants.length !== 1 ? 's' : ''} found
              </span>
            </div>

            <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">
              {participants.map((p) => (
                <label
                  key={p.id}
                  className={`flex items-center gap-3 rounded-md px-2 py-1.5 text-sm ${
                    p.alreadyImported
                      ? 'opacity-50'
                      : 'cursor-pointer hover:bg-muted'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={p.alreadyImported || selected.has(p.id)}
                    disabled={p.alreadyImported}
                    onChange={() => toggleSelect(p.id)}
                    className="rounded"
                  />
                  <div className="flex-1 truncate">
                    <span className="font-medium">
                      {[p.firstName, p.lastName].filter(Boolean).join(' ') || p.email}
                    </span>
                    {(p.firstName || p.lastName) && (
                      <span className="ml-2 text-muted-foreground">{p.email}</span>
                    )}
                  </div>
                  {p.alreadyImported && (
                    <span className="text-xs text-muted-foreground">Already added</span>
                  )}
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={importing || importableCount === 0}
              >
                {importing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : (
                  `Import ${importableCount} Evaluator${importableCount !== 1 ? 's' : ''}`
                )}
              </Button>
            </div>
          </div>
        )}

        {!loading && !result && participants.length === 0 && !error && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No active participants found in the linked StudyFlow study.
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
