# Handoff — Batch Flow Redesign

Date: 2026-04-21
Commit: `5d3d5ba` (`Redesign batch creation and team release flow`)

> **Superseded 2026-05-01:** Non-double-scored regular batches no longer use a single selected scorer per team. Items are now randomized once at the batch level and split evenly between the two team members via `FeedbackItem.slotIndex` (0 = slot A, 1 = slot B). The same slot label applies across every team in the batch — item with slot 0 always goes to each team's first member (alphabetical by email), slot 1 to the second member. The per-team scorer dropdown in the admin UI is gone; both teammates are assigned automatically. See `CLAUDE.md` "Scoring assignment rules" for the canonical description.

## What Was Built

This round replaced the old flat batch assignment model with a team-based release model.

Core changes:

- Regular batches are created from admin-only `Feedback_ID` ranges.
- Batch creation is now a full-screen flow at `/admin/[projectId]/batches/new`.
- Batch names are auto-generated and deterministic.
- All teams are auto-attached to new batches.
- Team visibility is controlled per batch, per team.
- Regular batches:
  - teams score only their assigned project criteria
  - single-scored batches use one selected scorer per team
  - double-scored batches use both team members
- Training batches:
  - use the same team assignment and visibility flow
  - visible team members score all project criteria
  - no per-team scorer selection
- Admin batch rows show per-team visibility and per-team progress.
- The `Visible now` toggle is optimistic and no longer reloads the whole batches view.

## Data Model

Key additions in [prisma/schema.prisma](/Users/taylorhaun/TAYTAY/CODE/writing-evaluator/prisma/schema.prisma):

- `Batch.isDoubleScored`
- `BatchRange`
- `TeamBatchRelease`
- `BatchAssignment.teamReleaseId`

Conceptually:

- `Batch` = the user-facing batch
- `BatchRange` = admin-only stored `Feedback_ID` slices used to compose the batch
- `TeamBatchRelease` = which team has the batch, whether it is visible, and who the scorer is for single-scored regular batches

## Main Files

- Create flow: [src/components/batch-builder-page.tsx](/Users/taylorhaun/TAYTAY/CODE/writing-evaluator/src/components/batch-builder-page.tsx)
- Create route + batch summaries: [src/app/api/projects/[projectId]/batches/route.ts](/Users/taylorhaun/TAYTAY/CODE/writing-evaluator/src/app/api/projects/[projectId]/batches/route.ts)
- Team release routes:
  - [src/app/api/projects/[projectId]/batches/[batchId]/releases/route.ts](/Users/taylorhaun/TAYTAY/CODE/writing-evaluator/src/app/api/projects/[projectId]/batches/[batchId]/releases/route.ts)
  - [src/app/api/projects/[projectId]/batches/[batchId]/releases/[releaseId]/route.ts](/Users/taylorhaun/TAYTAY/CODE/writing-evaluator/src/app/api/projects/[projectId]/batches/[batchId]/releases/[releaseId]/route.ts)
- Admin batch UI: [src/components/batch-creator.tsx](/Users/taylorhaun/TAYTAY/CODE/writing-evaluator/src/components/batch-creator.tsx)
- Batch tab loading: [src/components/project-detail-client.tsx](/Users/taylorhaun/TAYTAY/CODE/writing-evaluator/src/components/project-detail-client.tsx)
- Evaluator access checks:
  - [src/app/evaluate/[projectId]/page.tsx](/Users/taylorhaun/TAYTAY/CODE/writing-evaluator/src/app/evaluate/[projectId]/page.tsx)
  - [src/app/api/feedback-items/route.ts](/Users/taylorhaun/TAYTAY/CODE/writing-evaluator/src/app/api/feedback-items/route.ts)
  - [src/app/api/scores/route.ts](/Users/taylorhaun/TAYTAY/CODE/writing-evaluator/src/app/api/scores/route.ts)
- Release helper logic: [src/lib/team-batch-releases.ts](/Users/taylorhaun/TAYTAY/CODE/writing-evaluator/src/lib/team-batch-releases.ts)
- Completion / reconciliation logic:
  - [src/lib/batch-progress.ts](/Users/taylorhaun/TAYTAY/CODE/writing-evaluator/src/lib/batch-progress.ts)
  - [src/lib/reconciliation.ts](/Users/taylorhaun/TAYTAY/CODE/writing-evaluator/src/lib/reconciliation.ts)

## Test Setup

Project used for smoke testing: `Test #2`

Current fake annotators on `Test #2`:

- `fake-annotator-1@test.local`
- `fake-annotator-2@test.local`
- `fake-annotator-3@test.local`
- `fake-annotator-4@test.local`
- `fake-annotator-5@test.local`
- `fake-annotator-6@test.local`
- `fake-annotator-7@test.local`
- `fake-annotator-8@test.local`

Password for all fake annotators:

- `eval123`

Current team mapping on `Test #2`:

- `Team 1` → `Criterion 1`, `Criterion 2`
- `Team 2` → `Criterion 3`, `Criterion 4`
- `Team 3` → `Criterion 5`, `Criterion 6`
- `Team 4` → `Criterion 7`, `Criterion 8`

## Current UX Rules

Batch creation:

- No manual batch name entry
- Ranges are inclusive
- Overlapping ranges in one batch are blocked
- Already-batched items are blocked
- Invalid range typing is allowed while editing, but create is blocked until valid

Regular batch behavior:

- All teams are assigned automatically
- Per-team visibility is toggled later from the batch row
- If single-scored, each team has one scorer
- If double-scored, both team members score

Training batch behavior:

- All teams are assigned automatically
- Per-team visibility is toggled the same way
- Visible team members score all criteria

## What Was Verified

Verified during this session:

- `npx prisma generate`
- `npm run build`
- `doppler run --project writing-evaluator --config dev -- npx prisma db push`
- manual smoke test of batch creation / display / visibility behavior in dev

## Known Gaps / Next Work

Recommended next slice:

1. Per-team IRR
2. Clearer admin progress rollups

Why:

- The original IRR logic assumes a simple two-assignee batch.
- With one batch distributed across many teams, the useful unit is team-level IRR.
- Admins will likely need clearer summary signals such as:
  - teams visible / total teams
  - teams started / complete / not started
  - per-team IRR readiness for release decisions

Likely files for next slice:

- [src/lib/irr.ts](/Users/taylorhaun/TAYTAY/CODE/writing-evaluator/src/lib/irr.ts)
- [src/app/api/projects/[projectId]/batches/route.ts](/Users/taylorhaun/TAYTAY/CODE/writing-evaluator/src/app/api/projects/[projectId]/batches/route.ts)
- [src/components/batch-creator.tsx](/Users/taylorhaun/TAYTAY/CODE/writing-evaluator/src/components/batch-creator.tsx)

## Notes For Next Session

- Ignore untracked `.claude/worktrees/` and repo-root `AGENTS.md` unless intentionally needed.
- The current branch is `main`.
- The latest pushed checkpoint is `5d3d5ba`.
