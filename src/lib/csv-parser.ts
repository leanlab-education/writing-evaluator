// Parse CSV text with quote-aware field splitting
// Handles: quoted fields, commas inside quotes, escaped quotes

export interface FeedbackCSVRow {
  cycle_ID: string
  student_ID: string
  student_response: string
  feedback_ID: string
  annotator_ID: string
  feedback_text: string
  feedback_source: string // "AI" or "HUMAN"
}

export function parseCSV(text: string): FeedbackCSVRow[] {
  const lines = text.split('\n').filter((line) => line.trim())
  if (lines.length < 2) return []

  const headers = parseLine(lines[0]).map((h) => h.trim())
  const rows: FeedbackCSVRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i])
    if (values.length === 0) continue

    const row: Record<string, string> = {}
    headers.forEach((header, idx) => {
      row[header] = (values[idx] || '').trim()
    })

    rows.push(row as unknown as FeedbackCSVRow)
  }

  return rows
}

function parseLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++ // skip escaped quote
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        fields.push(current)
        current = ''
      } else {
        current += char
      }
    }
  }

  fields.push(current)
  return fields
}

// Validate required fields
export function validateCSVRow(
  row: FeedbackCSVRow,
  index: number
): string | null {
  if (!row.student_ID) return `Row ${index + 1}: missing student_ID`
  if (!row.feedback_ID) return `Row ${index + 1}: missing feedback_ID`
  if (!row.feedback_text) return `Row ${index + 1}: missing feedback_text`
  if (!row.student_response)
    return `Row ${index + 1}: missing student_response`

  const source = row.feedback_source?.toUpperCase()
  if (source && source !== 'AI' && source !== 'HUMAN') {
    return `Row ${index + 1}: feedback_source must be "AI" or "HUMAN", got "${row.feedback_source}"`
  }

  return null
}
