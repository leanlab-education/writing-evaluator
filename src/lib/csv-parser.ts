// Parse CSV text with quote-aware field splitting
// Handles: quoted fields, commas inside quotes, escaped quotes

// New 10-column Input_TEST format (from Quill data pipeline)
export interface FeedbackCSVRow {
  Response_ID: string
  Student_ID: string
  Cycle_ID: string
  Activity_ID: string
  Prompt_ID: string
  Student_Text: string
  Feedback_ID: string
  Feedback_Source: string // "AI" or "HUMAN"
  Annotator_ID: string
  Feedback_Text: string
}

// Column name mapping — supports both new (Input_TEST) and legacy formats
const COLUMN_ALIASES: Record<string, keyof FeedbackCSVRow> = {
  // New format (Input_TEST)
  Response_ID: 'Response_ID',
  Student_ID: 'Student_ID',
  Cycle_ID: 'Cycle_ID',
  Activity_ID: 'Activity_ID',
  Prompt_ID: 'Prompt_ID',
  Student_Text: 'Student_Text',
  Feedback_ID: 'Feedback_ID',
  Feedback_Source: 'Feedback_Source',
  Annotator_ID: 'Annotator_ID',
  Feedback_Text: 'Feedback_Text',
  // Legacy format aliases
  response_ID: 'Response_ID',
  student_ID: 'Student_ID',
  cycle_ID: 'Cycle_ID',
  activity_ID: 'Activity_ID',
  prompt_ID: 'Prompt_ID',
  student_response: 'Student_Text',
  feedback_ID: 'Feedback_ID',
  feedback_source: 'Feedback_Source',
  annotator_ID: 'Annotator_ID',
  feedback_text: 'Feedback_Text',
}

export function parseCSV(text: string): FeedbackCSVRow[] {
  const lines = text.split('\n').filter((line) => line.trim())
  if (lines.length < 2) return []

  const rawHeaders = parseLine(lines[0]).map((h) => h.trim())

  // Map raw headers to canonical names via aliases
  const mappedHeaders = rawHeaders.map(
    (h) => COLUMN_ALIASES[h] ?? (h as keyof FeedbackCSVRow)
  )

  const rows: FeedbackCSVRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i])
    if (values.length === 0) continue

    const row: Record<string, string> = {}
    mappedHeaders.forEach((header, idx) => {
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
  if (!row.Student_ID) return `Row ${index + 1}: missing Student_ID`
  if (!row.Feedback_ID) return `Row ${index + 1}: missing Feedback_ID`
  if (!row.Feedback_Text) return `Row ${index + 1}: missing Feedback_Text`
  if (!row.Student_Text) return `Row ${index + 1}: missing Student_Text`

  const source = row.Feedback_Source?.toUpperCase()
  if (source && source !== 'AI' && source !== 'HUMAN') {
    return `Row ${index + 1}: Feedback_Source must be "AI" or "HUMAN", got "${row.Feedback_Source}"`
  }

  return null
}
