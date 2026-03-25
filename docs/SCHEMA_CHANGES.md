# Schema Change Guide

This document explains how to update the three configurable schemas when new versions arrive from Amber/Quill/CZI.

---

## 1. Input CSV Format

**When**: Amber sends a new version of the input CSV with different columns.

### Files to update

| File | What to change |
|------|----------------|
| `src/lib/csv-parser.ts` | Column definitions and aliases |
| `src/app/admin/[projectId]/import/import-client.tsx` | Preview table + "Expected columns" hint |
| `src/app/api/feedback-items/route.ts` | Mapping from parsed CSV row → DB insert |
| `prisma/schema.prisma` | Add/rename fields on `FeedbackItem` model |

### Step-by-step

**Step 1 — Update the Prisma schema** (`prisma/schema.prisma`)

Add, rename, or remove fields on the `FeedbackItem` model. All optional columns should use `String?` (nullable). After editing:

```bash
npx prisma db push          # pushes schema to Neon
npx prisma generate         # regenerates the client
```

> ⚠️ If you rename or remove a non-nullable column that has existing data, Prisma will require `--force-reset` or a migration. Back up data first.

**Step 2 — Update the CSV parser** (`src/lib/csv-parser.ts`)

1. Update `FeedbackCSVRow` interface to match the new column names.
2. Update `COLUMN_ALIASES` to map any new column names to the canonical keys used in `FeedbackCSVRow`. Add old column names as aliases so existing CSVs don't break.
3. Update `validateCSVRow` if required fields change.

**Step 3 — Update the import API** (`src/app/api/feedback-items/route.ts`)

In the `POST` handler, update the `items.map(...)` inside the `prisma.feedbackItem.createMany()` call to pass the new fields from the parsed row to the DB.

**Step 4 — Update the import preview** (`src/app/admin/[projectId]/import/import-client.tsx`)

1. Update the "Expected columns" hint text at the top of the upload zone.
2. Add/remove columns in the `<TableHeader>` and `<TableBody>` of the preview table (the preview shows only the first 5 rows, showing key columns is enough).

---

## 2. Output (Export) CSV Format

**When**: The required export format changes — different columns, column order, or new derived fields.

### Files to update

| File | What to change |
|------|----------------|
| `src/app/api/export/route.ts` | Header row, value row, row-building logic |

### Step-by-step

**Step 1 — Update the header row** (`src/app/api/export/route.ts`, ~line 130)

The `headerRow` array defines column order. Modify it to match the new required output. The last entries (`Score_ID`, `Evaluator_Email`, then dimension labels) are dynamic — dimension columns are appended from the rubric.

**Step 2 — Update the value row**

The `values` array (inside the `for (const row of rowMap.values())` loop) must match the same order as `headerRow`. Add/remove entries correspondingly.

**Step 3 — Update the rowMap type and population** (if adding new derived fields)

If a new column requires data not currently fetched (e.g., a field from `FeedbackItem` that isn't in the `select`), add it to:
- The `rowMap` type definition (~line 79)
- The `feedbackItem: { select: { ... } }` in the Prisma query (~line 52)
- The `rowMap.set(rowKey, { ... })` call (~line 103)

**Step 4 — Update the export description in the UI** (`src/components/project-detail-client.tsx`)

Update the "Columns: ..." text in the Export tab cards so it matches the new format.

---

## 3. Rubric (Scoring Dimensions)

**When**: The rubric changes — different dimensions, renamed criteria, new scale, or different score labels.

There are two cases:

### Case A: Updating the default template for *new* projects

Edit `src/lib/rubric-templates.ts`. This only affects projects created *after* the change.

```typescript
export const DEFAULT_RUBRIC: RubricTemplate[] = [
  {
    key: 'criterion_1',      // internal key — used in export CSV column headers
    label: 'Criterion 1',    // displayed to evaluators
    description: '',         // optional tooltip under the label
    scaleMin: 1,
    scaleMax: 3,
    sortOrder: 0,
    scoreLabels: {
      1: { label: 'Not Present', description: '' },
      2: { label: 'Unclear',     description: '' },
      3: { label: 'Present',     description: '' },
    },
  },
  // ... more dimensions
]
```

**To rename dimensions** (e.g., "Criterion 1" → "Affective Support"):
- Change `label` and/or `description` in the template.
- Optionally change `key` if you want the export column header to change (note: changing `key` on existing DB rows requires a data migration — see below).

### Case B: Updating dimensions on an *existing* project in the DB

The rubric is stored in the `RubricDimension` table. There is currently no UI to edit rubric dimensions. Options:

**Option 1 — SQL update (quickest for small changes)**

Connect to Neon and run:
```sql
UPDATE "RubricDimension"
SET label = 'New Label', description = 'New description'
WHERE "projectId" = '<project-id>' AND key = 'criterion_1';
```

**Option 2 — Re-seed the rubric via script**

Create a one-off script under `scripts/` that deletes and recreates `RubricDimension` rows for the project. Be careful: changing dimension `id`s will orphan existing `Score` rows that reference the old `dimensionId`.

> ⚠️ **Key constraint**: Never change a dimension's `id` or `key` after scores have been recorded for it. The `Score` table references `dimensionId` (the UUID). Changing `key` only affects the export column header — it's safe if you only update `key` on the `RubricDimension` row directly. Changing `id` will break FK references.

**Option 3 — Adding a new dimension to an active project**

1. Insert a new `RubricDimension` row for the project.
2. Existing scores won't have a value for the new dimension — evaluators will need to re-score items, or the export will show empty cells for the new column.

---

## Current Schema Reference (as of 2026-03-25)

### Input CSV columns

```
Response_ID, Student_ID, Cycle_ID, Activity_ID, Conjunction_ID,
Student_Text, Feedback_Source, Teacher_ID, Feedback_Text,
optimal, feedback_type, Feedback_ID
```

- `Feedback_ID` is the primary key (unique per row)
- `Response_ID` can repeat (same student response gets both AI and HUMAN feedback)
- `Feedback_Source`: `"AI"` or `"HUMAN"` — blinded during scoring

### Output CSV columns

```
Response_ID, Student_ID, Cycle_ID, Activity_ID, Conjunction_ID,
Student_Text, Feedback_Source, Teacher_ID, Feedback_Text,
optimal, feedback_type, Feedback_ID,
Score_ID, Evaluator_Email, [Criterion 1 label], [Criterion 2 label], ...
```

- Input columns appear first, in the same order as the input CSV
- `Score_ID`: sequential ID generated at export time (e.g., `S001`)
- `Evaluator_Email`: email address of the evaluator
- Criterion columns use the rubric dimension `label` values as headers

### Rubric (default template)

8 generic dimensions, all 1–3 scale, labels: Not Present / Unclear / Present

| Key | Label |
|-----|-------|
| `criterion_1` | Criterion 1 |
| `criterion_2` | Criterion 2 |
| `criterion_3` | Criterion 3 |
| `criterion_4` | Criterion 4 |
| `criterion_5` | Criterion 5 |
| `criterion_6` | Criterion 6 |
| `criterion_7` | Criterion 7 |
| `criterion_8` | Criterion 8 |
