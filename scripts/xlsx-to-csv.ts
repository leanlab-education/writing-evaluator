import * as XLSX from 'xlsx'
import { writeFileSync } from 'fs'

const input = process.argv[2]
const output = process.argv[3]
if (!input || !output) {
  console.error('Usage: xlsx-to-csv.ts <input.xlsx> <output.csv>')
  process.exit(1)
}

const workbook = XLSX.readFile(input)
const sheetName = workbook.SheetNames[0]
const sheet = workbook.Sheets[sheetName]
const csv = XLSX.utils.sheet_to_csv(sheet)
writeFileSync(output, csv, 'utf8')
console.log(`Wrote ${csv.split('\n').length - 1} rows to ${output} (sheet: ${sheetName})`)
