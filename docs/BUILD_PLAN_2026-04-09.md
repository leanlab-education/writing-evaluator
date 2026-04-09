# Build Plan — Post 4/9 Meeting

**Date:** 2026-04-09
**Source:** Meeting with Amber & Rachel on 2026-04-09 (`MEETING_NOTES_2026-04-09.md`), plus Slack follow-ups, plus Abstrackr research (`RESEARCH_ABSTRACKR_2026-04-09.md`).
**Goal:** Ship the next iteration of the Writing Evaluator so Amber and Rachel can do a real test run.

---

## Guiding principles

1. **Do it right the first time.** Prisma migrations, proper types, clean deletions of dead code. No band-aids.
2. **Don't break what already works.** The reconciliation flow (shipped 4/7) is functional — add to it, don't regress it.
3. **Server/client boundaries stay clean.** Per CLAUDE.md — server components fetch data, client components handle interaction. Use `router.refresh()` after mutations.
4. **Semantic tokens only.** No hardcoded Tailwind colors. All new UI uses the design system.
5. **Commit at logical checkpoints.** Each phase is one or more commits. Easy to roll back if something goes sideways.
6. **Verify in the preview after each phase.** Use preview tools, not manual testing requests to the user.

---

## Phases

### Phase 1 — Foundation: rename + trigger rule fix
**Why first:** Terminology is cross-cutting. Rename `Calibration` → `Training` early so every subsequent phase uses correct names. Trigger rule fix unblocks Phase 4 (adjudicator) by making reconciliation behavior predictable.

**Work:**
1. Investigate why the Training (formerly Calibration) batch type is no longer visible in the batch creator UI — Amber said it "disappeared." Fix or restore it.
2. Rename `BatchType.CALIBRATION` → `BatchType.TRAINING` throughout:
   - Prisma schema enum + migration via `ALTER TYPE ... RENAME VALUE`
   - `src/components/batch-creator.tsx` — dropdown, copy
   - `src/app/api/projects/[projectId]/batches/route.ts` — create handler
   - `src/app/api/my-team/route.ts` — any filter
   - `src/app/evaluate/[projectId]/evaluate-client.tsx` — UI behavior (Training shows all criteria)
   - `CLAUDE.md`, `docs/V2_PLAN.md` — docs
3. Change reconciliation trigger rule:
   - Current: `batchType === 'DOUBLE'` triggers the reconcile UI
   - New: `assigneeCount > 1` triggers it (per Amber's instinct from the transcript: "anytime there's two or more people, we need that reconciliation view")
   - This decouples the trigger from the enum and lets Training batches coexist with reconciliation logic if ever needed.

**Verification:** Create a Training batch in preview, confirm it accepts multiple evaluators and shows all criteria. Create a Double-Scored batch, confirm reconcile view still triggers.

**Commit:** `feat: rename Calibration → Training + decouple reconcile trigger from BatchType`

---

### Phase 2 — Three-box notes in reconciliation view
**Why next:** Half-done already (per-item notes exist on the scoring UI; reconcile client has a notes state field). Small scope. Immediately visible to Amber on next demo. The meeting's headline feature request.

**Work:**
1. **Discrepancies API** — update `/api/projects/[projectId]/batches/[batchId]/discrepancies/route.ts`:
   - Add per-item `evaluators` array to the response: `[{userId, name, email, notes}]`
   - Notes are per-item (stored redundantly on each Score row for an item/user), so pull from any one of each coder's Score rows for that item
2. **Reconcile client** — update `src/app/reconcile/[projectId]/reconcile-client.tsx`:
   - Extend `DiscrepantItem` type with `evaluators` array
   - Add a "Coder notes" section above the existing notes textarea that shows both coders' notes read-only, only when present (conditionally render, not empty placeholders)
   - Rename the existing notes textarea label to "Why we decided what we did" (from "Notes (optional)")
   - Change the placeholder copy to match — something like "Brief rationale for the final score (shown in export)"
3. **Reconcile API** — verify `/api/projects/[projectId]/batches/[batchId]/reconcile/route.ts` persists notes to the reconciled Score row (it already does — confirmed line 133 and 143 — just make sure nothing regressed)
4. **Discrepancy CSV export** — update `/api/export/route.ts` `handleDiscrepancyExport`:
   - Add three new columns: `Coder_A_Notes`, `Coder_B_Notes`, `Reconciliation_Notes`
   - Coder notes come from original Score rows
   - Reconciliation notes come from isReconciled Score row (null if not yet reconciled)

**Verification:** Create a Double-Scored batch, score it as two users with notes, move to Reconciling, open reconcile view, confirm both sets of notes render. Export discrepancy CSV, confirm notes columns present.

**Commit:** `feat: three-box notes in reconciliation view + CSV export`

---

### Phase 3 — Batch creator UX cleanups
**Why now:** Small, self-contained, keeps momentum. Amber noted the "awkward" plus sign in the meeting and asked for denser batch tiles. Fix before bigger features pile on top of the current creator UI.

**Work:**
1. Reduce batch tile height — batch list shows tiles 5 lines tall. Target 2 lines. Preserve all info, just denser layout.
2. Fix the "add second evaluator to make Double" UX — currently requires a plus sign click that Taylor even got confused by in the demo. Make it a real pattern:
   - Either: a multi-select for evaluators with auto-detected batch type (1 selected = Independent, 2 selected = Double)
   - Or: explicit radio/toggle for batch type, then an evaluator picker that shows N slots based on type

**Verification:** Create a batch end-to-end, confirm the flow is obvious. Scan the batch list with 10+ batches — tiles should be readable without scrolling a mile.

**Commit:** `feat: denser batch tiles + cleaner batch creator flow`

---

### Phase 4 — Adjudicator + escalation
**Why here:** Meeting's biggest new feature. Needs Phase 1's trigger rule and Phase 2's notes to work cleanly. Self-contained from here — doesn't depend on rolling uploads.

**Work:**
1. **Schema changes:**
   - Add `adjudicatorId String? @db.Cuid` to Batch model (FK to User, nullable, onDelete: SetNull)
   - Add new `Escalation` model:
     ```
     Escalation {
       id             String   @id @default(cuid())
       batchId        String
       feedbackItemId String
       escalatedById  String   // userId of the pair member who clicked Escalate
       reason         String   // required short text
       resolvedById   String?  // adjudicator userId
       resolvedAt     DateTime?
       createdAt      DateTime @default(now())
       batch          Batch    @relation(...)
       feedbackItem   FeedbackItem @relation(...)
       escalatedBy    User @relation("EscalatedBy", ...)
       resolvedBy     User? @relation("ResolvedBy", ...)
       @@unique([batchId, feedbackItemId])
     }
     ```
   - Update User model with back-relations
2. **Admin UI — assign adjudicator:**
   - On the batch detail card (admin view), add an "Adjudicator" dropdown showing all project evaluators + Amber/Rachel by email
   - PATCH handler on `/api/projects/[projectId]/batches/[batchId]` to set `adjudicatorId`
3. **Reconcile UI — escalate button:**
   - Per-item "Need Adjudicator" button in the reconcile view
   - Opens a small dialog asking for a required short reason (1-2 sentences)
   - Submits to a new POST `/api/projects/[projectId]/batches/[batchId]/escalate` endpoint
   - Escalated items show a "Escalated to adjudicator" state in the reconcile view and skip in the item navigation (pair can't re-claim)
4. **Adjudicator queue view:**
   - New route `/adjudicate` — lists all escalated items across batches where current user is adjudicator
   - Each item: student text, feedback text, rubric, both coders' scores on disputed dimensions, both coders' notes, pair's reconciliation notes (if any), escalation reason
   - Adjudicator picks the final score for each disputed dimension, adds optional adjudicator notes, submits
   - Submission writes an `isReconciled: true` Score row (same pattern as pair reconciliation) and marks the Escalation row resolved
5. **Dashboard badge:**
   - If current user is an adjudicator on any batch with open escalations, show a pill on their dashboard: "N items need adjudication"

**Verification:** As user A, score a Double-Scored batch. As user B, score it with different scores. Move to Reconciling as admin. As user A, escalate an item with a reason. As adjudicator, open `/adjudicate`, resolve it, submit. Check the resolved score exists in the database as `isReconciled: true`.

**Commit:** `feat: adjudicator assignment + escalation workflow`

---

### Phase 5 — IRR calculation + display
**Why here:** Supports Phase 6 (visibility control) by giving admins the info they need to manually release Independent batches. Small scope. Self-contained.

**Work:**
1. New util `src/lib/irr.ts` — computes agreement percentage for a Double-Scored batch:
   - For each (item, dimension) pair scored by two evaluators, count matches / total
   - Return overall %, per-dimension %, and per-team-criterion % if the batch has team-based criteria assignment
2. Add IRR % to the `GET /api/projects/[projectId]/batches/[batchId]` response (only for Double-Scored batches in RECONCILING or COMPLETE status)
3. Display IRR % on the batch card in the admin view — green if >80%, amber if 60-80%, red if <60% (semantic tokens only)
4. **No automatic gate.** Just display. Admins decide when to release.

**Verification:** Score a Double-Scored batch with known discrepancies, open the admin batch view, confirm the IRR % matches what you expect.

**Commit:** `feat: IRR calculation and display for Double-Scored batches`

---

### Phase 6 — Batch visibility control
**Why here:** Rachel's strong preference from the meeting. Small scope (one boolean field + one toggle + one filter). Enables the Double-before-Independent workflow.

**Work:**
1. Add `isHidden Boolean @default(false)` to Batch model
2. Admin UI — toggle on the batch detail card: "Hidden from annotators" with a tooltip explaining the Double-before-Independent pattern
3. Update evaluator dashboard queries (`/api/my-projects/route.ts` and related) to filter out `isHidden: true` batches
4. Make sure admins still see hidden batches (clearly marked as hidden in the admin view)

**Verification:** Hide a batch as admin, log in as evaluator, confirm it doesn't appear. Show it, confirm it reappears.

**Commit:** `feat: batch visibility control (hide from annotators)`

---

### Phase 7 — Rolling uploads
**Why last:** Biggest structural change, highest risk of bugs. By the time I get here, everything else is shipped and working, so I can focus on getting this right without worrying about breaking other phases.

**Work:**
1. **Provenance tracking:**
   - Add `Import` model: `id`, `projectId`, `filename`, `createdById`, `itemCount`, `skippedCount`, `createdAt`
   - Add `importId String?` to FeedbackItem (nullable for backfill compat)
2. **Import API changes** (`/api/feedback-items/route.ts` POST handler):
   - Wrap insert in a try/catch per-row OR use `createMany` with `skipDuplicates: true` (Prisma supports this for Postgres with unique constraints — already have `@@unique([projectId, feedbackId])`)
   - Return counts: `{ imported: N, skipped: M, importId: "..." }`
   - Create an Import row for provenance
3. **Import UI changes** (`src/app/admin/[projectId]/import/import-client.tsx`):
   - After upload, show "X items imported, Y duplicates skipped"
   - Display import history as a table
4. **Batch creator — scope by import:**
   - Add an optional "From import" dropdown — defaults to "All unbatched items"
   - When an import is selected, batch creation only sees items from that import
   - This is Amber's "select which file" idea from the transcript
5. **Unbatched pool stays as the default:**
   - New items always have `batchId: null` until explicitly batched
   - Existing batch creator already works on unbatched items; just adds the import filter

**Verification:** Import a CSV (should work). Import the same CSV again (should skip all items, report skip count). Import a new CSV with some overlap (should import new items, skip duplicates). Create a batch from the new import, confirm only new items are in it.

**Commit:** `feat: rolling CSV uploads with dedup and per-import batching`

---

### Phase 8 — Nice-to-haves (if time)

1. **Notes dialog refactor** — per Abstrackr pattern. Replace inline Textarea with a button that opens a small dialog. Takes zero vertical space when notes are empty (the common case).
2. **Batch type label on annotator view** — show "Training", "Double-Scored", "Independent" on the batch card in the evaluator dashboard. Fallback communication mechanism if admin visibility control isn't used.
3. **Real-time IRR dashboard widget** — a small panel on the project overview showing live IRR across all Double-Scored batches. Covidence/Abstrackr pattern.

---

## Assumptions I'm committing to (flagged in conversation with Taylor)

These are decisions I made without a direct answer from Amber/Rachel. If they disagree later, each is cheap to change:

1. **Rolling upload dedup:** by `Feedback_ID` (skip duplicates silently, show skip count)
2. **IRR gate:** visibility control only, no hardcoded auto-gate. IRR is displayed for info.
3. **Escalation granularity:** per-item, not per-dimension
4. **Reconciliation auto-trigger:** none — admin still manually moves batch DRAFT → SCORING → RECONCILING
5. **Adjudicator visibility:** sees everything (scores, coder notes, reconciliation notes, escalation reason, full rubric)
6. **Visibility control:** per-batch (all annotators at once), not per-evaluator
7. **Escalation reason:** required short text (1-2 sentences)

---

## Out of scope (explicitly not in this plan)

- **Drift check feature** — explicitly dropped in the meeting per Rachel: "so I think we can throw away this drift check idea based on that"
- **ML-assisted scoring or ranking** — Abstrackr has this but it's not in scope for Quill/CZI
- **Rayyan-style active learning** — same
- **MFA / TOTP** — deferred per `project_asvs_mfa.md` memory
- **Remaining ASVS L2 mediums** (rate limiting, logging, audit log, token revocation) — separate track, not meeting-driven
- **Generalization beyond Quill/CZI** — Rachel mentioned the tool has broader qualitative-research value; that's a future conversation, not this iteration

---

## Pre-flight checks before starting

1. Confirm current schema matches what I've been reading (re-read schema.prisma — done)
2. Confirm dev server runs cleanly (`npm run dev` via preview_start)
3. Confirm Prisma client is fresh (`npx prisma generate` if needed)
4. Confirm git status clean before starting so each phase is a clean commit
