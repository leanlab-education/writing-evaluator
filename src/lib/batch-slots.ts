import { prisma } from '@/lib/db'

/**
 * For non-double-scored regular batches: shuffle items in the batch and assign
 * each one to slot 0 ("A") or slot 1 ("B"), split as evenly as possible. The
 * same slot label is consistent across all four teams — item X always goes to
 * each team's slot-A or slot-B member. Idempotent only when no items are missing
 * a slot; otherwise re-runs the shuffle for the entire batch.
 *
 * Uses crypto.randomInt for CSPRNG-quality randomness, matching the codebase's
 * blinding shuffle convention.
 */
export async function assignBatchSlots(batchId: string) {
  const items = await prisma.feedbackItem.findMany({
    where: { batchId },
    select: { id: true, slotIndex: true },
  })

  if (items.length === 0) return

  const allAssigned = items.every((item) => item.slotIndex !== null)
  if (allAssigned) return

  const { randomInt } = await import('crypto')
  const ids = items.map((item) => item.id)
  for (let index = ids.length - 1; index > 0; index--) {
    const swapIndex = randomInt(index + 1)
    ;[ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]]
  }

  const halfway = Math.ceil(ids.length / 2)
  const slotA = ids.slice(0, halfway)
  const slotB = ids.slice(halfway)

  await prisma.$transaction([
    prisma.feedbackItem.updateMany({
      where: { id: { in: slotA } },
      data: { slotIndex: 0 },
    }),
    prisma.feedbackItem.updateMany({
      where: { id: { in: slotB } },
      data: { slotIndex: 1 },
    }),
  ])
}

/**
 * Clear slot assignments for a batch. Used when a batch toggles into a mode
 * where slots no longer apply (e.g. converted to double-scored).
 */
export async function clearBatchSlots(batchId: string) {
  await prisma.feedbackItem.updateMany({
    where: { batchId },
    data: { slotIndex: null },
  })
}

/**
 * Given a sorted list of team member userIds (asc by email), return the slot
 * index for the given userId. Returns null if user is not on the team.
 */
export function getMemberSlotIndex(
  sortedMemberUserIds: string[],
  userId: string
): number | null {
  const index = sortedMemberUserIds.indexOf(userId)
  return index === -1 ? null : index
}
