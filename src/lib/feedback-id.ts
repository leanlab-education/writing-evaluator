export interface FeedbackIdParts {
  prefix: string
  numeric: number | null
  raw: string
}

export function parseFeedbackId(feedbackId: string): FeedbackIdParts {
  const trimmed = feedbackId.trim()
  const match = trimmed.match(/^([^\d]*)(\d+)$/)

  if (!match) {
    return {
      prefix: trimmed.toLowerCase(),
      numeric: null,
      raw: trimmed.toLowerCase(),
    }
  }

  return {
    prefix: match[1].toLowerCase(),
    numeric: Number.parseInt(match[2], 10),
    raw: trimmed.toLowerCase(),
  }
}

export function compareFeedbackIds(a: string, b: string): number {
  const aParts = parseFeedbackId(a)
  const bParts = parseFeedbackId(b)

  if (aParts.prefix !== bParts.prefix) {
    return aParts.prefix.localeCompare(bParts.prefix)
  }

  if (aParts.numeric !== null && bParts.numeric !== null) {
    if (aParts.numeric !== bParts.numeric) {
      return aParts.numeric - bParts.numeric
    }
  }

  return aParts.raw.localeCompare(bParts.raw)
}
