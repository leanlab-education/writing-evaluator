import { prisma } from '@/lib/db'

/**
 * Computes exact-match inter-rater reliability (IRR) for a batch.
 *
 * Returns percentage of (item, dimension) pairs where both evaluators
 * gave the same value, out of total pairs where both evaluators scored.
 * Per Amber's 2026-04-09 meeting: "exact match required" — no tolerance band.
 *
 * Per Amber's answer to Q2: display this to admins; there is no automatic
 * gate. Admins decide when to release Independent batches based on IRR.
 *
 * Only meaningful for batches with exactly 2 evaluators. For Training
 * batches (8 evaluators scoring everything) this returns null since
 * pairwise IRR isn't applicable to the multi-rater case.
 *
 * Returns null if IRR can't be computed (fewer than 2 evaluators, no
 * scored pairs yet, etc).
 */
export interface BatchIRR {
  agreementPct: number // 0-100
  agreedPairs: number
  totalPairs: number
  perDimension: {
    dimensionId: string
    dimensionLabel: string
    agreementPct: number
    agreedPairs: number
    totalPairs: number
  }[]
}

export async function computeBatchIRR(batchId: string): Promise<BatchIRR | null> {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: {
      type: true,
      assignments: { select: { userId: true } },
    },
  })
  if (!batch) return null

  // Only compute for exactly-2-evaluator batches; multi-rater IRR (8 coders
  // on a Training batch) is a different calculation and out of scope.
  if (batch.assignments.length !== 2) return null
  if (batch.type === 'TRAINING') return null

  const scores = await prisma.score.findMany({
    where: {
      feedbackItem: { batchId },
      isReconciled: false,
    },
    select: {
      feedbackItemId: true,
      dimensionId: true,
      value: true,
      userId: true,
      dimension: { select: { id: true, label: true, sortOrder: true } },
    },
  })

  // Group by (item, dimension) and collect both evaluators' values
  const groups = new Map<
    string,
    {
      dimensionId: string
      dimensionLabel: string
      sortOrder: number
      values: number[]
    }
  >()
  for (const s of scores) {
    const key = `${s.feedbackItemId}::${s.dimensionId}`
    if (!groups.has(key)) {
      groups.set(key, {
        dimensionId: s.dimension.id,
        dimensionLabel: s.dimension.label,
        sortOrder: s.dimension.sortOrder,
        values: [],
      })
    }
    groups.get(key)!.values.push(s.value)
  }

  let agreedPairs = 0
  let totalPairs = 0

  // Per-dimension aggregates
  const perDim = new Map<
    string,
    { label: string; sortOrder: number; agreed: number; total: number }
  >()

  for (const [, g] of groups) {
    if (g.values.length !== 2) continue
    totalPairs++
    const agreed = g.values[0] === g.values[1]
    if (agreed) agreedPairs++

    const entry = perDim.get(g.dimensionId) ?? {
      label: g.dimensionLabel,
      sortOrder: g.sortOrder,
      agreed: 0,
      total: 0,
    }
    entry.total++
    if (agreed) entry.agreed++
    perDim.set(g.dimensionId, entry)
  }

  if (totalPairs === 0) return null

  const perDimension = Array.from(perDim.entries())
    .sort((a, b) => a[1].sortOrder - b[1].sortOrder)
    .map(([dimensionId, entry]) => ({
      dimensionId,
      dimensionLabel: entry.label,
      agreementPct: Math.round((entry.agreed / entry.total) * 100),
      agreedPairs: entry.agreed,
      totalPairs: entry.total,
    }))

  return {
    agreementPct: Math.round((agreedPairs / totalPairs) * 100),
    agreedPairs,
    totalPairs,
    perDimension,
  }
}
