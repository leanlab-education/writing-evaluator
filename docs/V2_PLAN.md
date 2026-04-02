# Writing Evaluator V2 — Implementation Plan

**Date:** 2026-04-02
**Status:** Draft — pending Taylor's review before execution

---

## Context

Amber confirmed the V2 spec. The core shift: evaluators are no longer interchangeable. They work in **teams of 2**, each team scoring only **2 of 8 criteria**. Batching becomes the primary unit of work assignment, with structured admin controls for filtering and assigning items.

### Numbers at a Glance

| Metric | Value |
|--------|-------|
| Total evaluators | 8 |
| Teams (pairs) | 4 |
| Criteria per team | 2 |
| Total feedback items | ~10,000 |
| Items per evaluator (first scorer) | 5,000 |
| Double-scored items (20% IRR) | 1,000 per evaluator |
| Grand total per evaluator | ~6,000 |
| Typical batch size | 250 items |
| Calibration batch | ~25 items, all evaluators, all 8 criteria |

---

## Phase 1: Schema Changes

### New Model: `EvaluatorTeam`

Represents a pair of evaluators assigned to specific rubric criteria.

```prisma
model EvaluatorTeam {
  id        String   @id @default(cuid())
  projectId String
  name      String   // e.g., "Team Alpha", "Gryffindor"

  project   Project  @relation(fields: [projectId], references: [id])
  members   EvaluatorTeamMember[]
  dimensions EvaluatorTeamDimension[]

  createdAt DateTime @default(now())

  @@unique([projectId, name])
}

model EvaluatorTeamMember {
  id     String @id @default(cuid())
  teamId String
  userId String

  team   EvaluatorTeam @relation(fields: [teamId], references: [id])
  user   User          @relation(fields: [userId], references: [id])

  @@unique([teamId, userId])
  @@unique([userId, teamId]) // one team per evaluator per project (enforced at app level)
}

model EvaluatorTeamDimension {
  id          String @id @default(cuid())
  teamId      String
  dimensionId String

  team      EvaluatorTeam  @relation(fields: [teamId], references: [id])
  dimension RubricDimension @relation(fields: [dimensionId], references: [id])

  @@unique([teamId, dimensionId])
}
```

### Changes to Existing Models

**`Batch`** — Add fields:
```prisma
model Batch {
  // ... existing fields ...
  type        BatchType @default(REGULAR)  // NEW
  isAssigned  Boolean   @default(false)    // NEW — locks batch after assignment
}

enum BatchType {
  REGULAR      // normal scoring — evaluator sees only their team's criteria
  CALIBRATION  // all evaluators score all 8 criteria (for IRR baseline)
}
```

**`Assignment`** — Add field to distinguish first scorer vs. double scorer:
```prisma
model Assignment {
  // ... existing fields ...
  scoringRole  ScoringRole @default(PRIMARY)  // NEW
}

enum ScoringRole {
  PRIMARY    // first scorer — this is "their" item
  DOUBLE     // double-scoring for IRR — scoring partner's item
}
```

**`Score`** — No schema changes needed. The existing unique constraint `[feedbackItemId, userId, dimensionId, isReconciled]` already supports multiple evaluators scoring the same item on the same dimension.

### Migration Summary

```
New models:     EvaluatorTeam, EvaluatorTeamMember, EvaluatorTeamDimension
New enums:      BatchType, ScoringRole
Modified models: Batch (add type, isAssigned), Assignment (add scoringRole)
No destructive changes — all additive.
```

---

## Phase 2: Team Management (Admin UI)

### New Tab: "Teams" on Project Detail Page

Located between "Evaluators" and "Batches" tabs.

**UI:**
- Create team: name + select 2 evaluators from project roster + select 2 rubric dimensions
- Display teams as cards showing: team name, 2 members, 2 assigned criteria
- Edit team: rename, swap members, change criteria (only if no scores recorded yet)
- Validation: each evaluator can only be on one team per project; each dimension assigned to exactly one team

**API Endpoints:**
- `POST /api/projects/[projectId]/teams` — Create team with members + dimensions
- `GET /api/projects/[projectId]/teams` — List teams with members + dimensions
- `PATCH /api/projects/[projectId]/teams/[teamId]` — Update team
- `DELETE /api/projects/[projectId]/teams/[teamId]` — Delete team (only if no scores)

---

## Phase 3: Batch Creation Overhaul

### Replace Current Batch Generation

The current "Generate Batches" auto-groups by activity/conjunction. Replace with a more manual, step-by-step flow:

**Admin Batch Creation Flow:**
1. Click "Create Batch"
2. Select Activity_ID (dropdown populated from imported items)
3. Select Conjunction_ID (dropdown filtered by selected activity)
4. System shows: "X items available matching these filters"
5. Set batch size (default 250, or "all remaining")
6. Toggle "Randomize feedback source order" (default on)
7. Name the batch (auto-suggested: e.g., "Activity 1 / Because / Batch 3")
8. Create → items assigned to batch, display order randomized if toggled

**Key behaviors:**
- Items already in a batch are excluded from available items
- Admin can see unassigned item count per Activity_ID × Conjunction_ID
- Batch creation pulls from unassigned items only
- Randomization shuffles AI/HUMAN ordering (the `displayOrder` within the batch)

**Calibration batch creation:**
- Separate "Create Calibration Batch" button
- Select specific items (or random sample of N items)
- Marked as `CALIBRATION` type
- Will be assigned to ALL evaluators with ALL criteria visible

### Batch Assignment Flow

After batches exist:
1. Select a batch
2. Assign to an individual evaluator (dropdown of project evaluators)
3. Choose scoring role: Primary or Double (for IRR)
4. Batch becomes locked (`isAssigned = true`) once any assignment is made
5. For calibration batches: "Assign to All Evaluators" button

**API Endpoints:**
- `POST /api/projects/[projectId]/batches` — Create batch with filters
- `PATCH /api/projects/[projectId]/batches/[batchId]` — Edit batch (name, reorder — only if not assigned)
- `POST /api/projects/[projectId]/batches/[batchId]/assign` — Assign evaluator to batch
- `DELETE /api/projects/[projectId]/batches/[batchId]/assign/[assignmentId]` — Remove assignment (only if no scores)

---

## Phase 4: Scoring UI Changes

### Criteria Filtering

**Current:** Evaluator sees all rubric dimensions for every item.

**New:** Evaluator sees only their team's dimensions, UNLESS:
- The item is in a calibration batch → show all 8 dimensions
- (Future edge case: admin overrides)

**Implementation:**
- When loading project data for evaluate page, look up the evaluator's team
- Filter `project.rubric` to only the team's assigned dimensions
- For calibration batch items, skip the filter and show all dimensions
- The scoring UI, auto-save, and score submission all work the same — just fewer dimensions per item

### Evaluator Dashboard Changes

**Current:** Shows assigned projects with overall progress.

**New additions:**
- Show team name and assigned criteria
- Show batch-level progress (e.g., "Batch 3: 47/250 scored")
- Navigate by batch rather than one giant item list
- Distinguish primary vs. double-scoring batches visually

---

## Phase 5: Export Changes

### New Export Columns

Add to the export CSV:
- `Scoring_Role` — "PRIMARY" or "DOUBLE" (per score row)
- `Team_Name` — evaluator's team name
- `Batch_Name` — which batch the item was in
- `Batch_Type` — "REGULAR" or "CALIBRATION"

### IRR Export

New export option: "Download IRR Comparison"
- Filters to items that have both PRIMARY and DOUBLE scores
- Side-by-side format: Item_ID, Dimension, Primary_Evaluator, Primary_Score, Double_Evaluator, Double_Score, Agreement (Y/N)

---

## Phase 6: Quick Wins / Cleanup (Do First)

These are low-risk changes from the original handoff prompt that should be done before V2 work begins:

1. **Rename CSV labels:** `Annotator_ID` → `Teacher_ID`, `Prompt_ID` → `Conjunction_ID` in:
   - `scripts/import-amber-csv.ts`
   - `test-data/amber-cycle1.csv`
   - `scripts/test-data.csv`
   - `docs/MEETING_NOTES_2026-03-18.md`

2. **Multiple imports:** Verify that importing CSVs multiple times into the same project works cleanly (it should — `skipDuplicates` on `feedbackId` unique constraint). Add a note in the import UI: "You can import additional items at any time."

---

## Execution Order

```
Phase 6 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
(cleanup)  (schema)  (teams)   (batches)  (scoring) (export)
```

Each phase is independently deployable. Phase 1 is additive schema changes only (no breaking changes). Phases 2-5 build on each other but can be developed incrementally.

---

## Open Questions (Deferred)

- **Batch editing after assignment:** Can Amber reorganize batches after they're assigned? Current plan: locked after assignment. Revisit if needed.
- **IRR threshold:** What agreement level triggers a flag? Amber to define.
- **Calibration batch workflow:** Exact flow for how calibration results are reviewed/compared. Build the data model now, build the analysis UI later.
- **Reconciliation phase:** How does reconciliation work with the team model? Does the team resolve their own discrepancies, or does an admin? Defer to later.

---

## Files That Will Change

### New Files
- `src/app/api/projects/[projectId]/teams/route.ts`
- `src/app/api/projects/[projectId]/teams/[teamId]/route.ts`
- `src/components/team-management.tsx`
- `src/components/batch-creator.tsx`

### Modified Files
- `prisma/schema.prisma` — new models + enums + modified fields
- `src/components/project-detail-client.tsx` — new Teams tab, overhauled Batches tab
- `src/app/evaluate/[projectId]/evaluate-client.tsx` — criteria filtering, batch navigation
- `src/components/evaluator-dashboard.tsx` — team info, batch progress
- `src/app/api/projects/[projectId]/batches/route.ts` — new batch creation logic (may be new file)
- `src/app/api/projects/[projectId]/assignments/route.ts` — scoring role support
- `src/app/api/scores/route.ts` — no changes needed (already dimension-scoped)
- `src/app/api/export/route.ts` — new columns, IRR export option
- `scripts/import-amber-csv.ts` — CSV label renames
- `test-data/amber-cycle1.csv` — header renames
- `scripts/test-data.csv` — header renames
- `docs/MEETING_NOTES_2026-03-18.md` — old name references
