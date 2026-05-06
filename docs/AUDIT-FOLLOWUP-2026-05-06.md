# Codebase Audit Follow-Up — 2026-05-06

Resume notes for the post-audit cleanup. Started 2026-05-06.
Audit findings live in chat history; this doc tracks **what's done, what's left, and what decisions are blocking the remaining work**.

---

## ✅ Completed (4 commits, on `main`, **not yet pushed**)

| # | Commit | Summary |
|---|--------|---------|
| 1 | `3091e2c` | Validate `studyflowStudyId` on project PATCH (regex + 400 on bad input) |
| 4 | `825faf8` | Fix N+1 in evaluator-stats counting (4 callers, replaced per-batch `count()` loops with one `groupBy`) |
| 5 | `5b0b97f` | Extract `lib/evaluator-stats.ts` helper. **Net -101 lines** across 4 callers (`page.tsx`, `admin/[projectId]/page.tsx`, `api/projects/[projectId]/evaluators/route.ts`, `api/my-projects/route.ts`) |
| 6 | `c1356e3` | Stop accepting `status` in project PATCH. The displayed status is computed live from batch states; the DB column is a stale default that no UI ever writes. PATCH is now narrowed to `studyflowStudyId` only. |

All four passed `tsc` + live data verification (Annotators tab on Test #2 shows identical counts: 770 assigned, 556–561 completed).

**Reminder: `git push` these when picking back up if not done already.**

---

## ⛔ Skipped — false positive

**#2** "Stop `error.message` leaks in batches route" — investigated and it doesn't reproduce. Both `catch` blocks at `batches/route.ts:494` and `:542` wrap purely synchronous validation logic. The only throws inside the try blocks are developer-authored `throw new Error('Range 2 is missing...')` — no Prisma calls. The `error.message` surfaced to the client is always developer-controlled. Safe to leave as-is.

---

## 🔻 Mockups deletion (#10)

Already deleted locally (`src/app/admin/mockups/`). It was never committed to git in the first place, so there's no commit for it. If the directory reappears (e.g. via worktree restore), delete again — it's 848 lines of stale design-exploration code with a TS error and no production purpose.

---

## ⏸️ Pending: #7 — Drop legacy `TeamBatchRelease.scorerUserId`

**Status: blocked on Taylor's decision.**

When I traced usage, the field is **far from dead**, despite CLAUDE.md saying "preserved on existing rows but unused by the UI":

### Active writers (accept `scorerUserId` from request body)
- `POST /api/projects/[projectId]/batches/[batchId]/releases/route.ts` — release creation
- `PATCH /api/projects/[projectId]/batches/[batchId]/releases/[releaseId]/route.ts` — release updates (with a `hasReleaseScores` guard)

### Active readers
- `GET /api/projects/[projectId]/batches/route.ts:67-237` — builds a `scorer` object for the UI when `release.scorerUser && !batch.isDoubleScored`
- `src/components/batch-creator.tsx` — types it, displays it
- `src/lib/team-batch-releases.ts` — has it in the type definition that's used by `evaluator-stats.ts`

### Schema
- FK to `User` with named relation `TeamBatchReleaseScorer`
- Five `scorerUserId: null` writes in code paths that explicitly null it for new non-double-scored regular batches (the slot-split path)

So the codebase actually supports **two paths in production**: legacy assigned-scorer batches and new slot-split batches. CLAUDE.md's claim that the field is "unused by the UI" is out of date.

### Three options — Taylor needs to pick

#### (a) Conservative UI cleanup — *recommended starting point*
- Keep schema + endpoints unchanged.
- Stop *displaying* the legacy scorer in the UI when slot-split is the modern default.
- Only render the old "scorer" indicator for legacy rows that already have it set.
- **Risk: low. Effort: ~30 min. Keeps tech debt around.**

#### (b) Stop accepting it on writes
- Make `POST/PATCH /releases/*` ignore `scorerUserId` from the body so no new legacy rows are ever created.
- Field stays in schema; existing rows still display it.
- Eventually all legacy rows complete and you can drop the field in a future cleanup.
- **Risk: medium.** Need to confirm no admin workflow lets an admin manually pick a single scorer for a non-double-scored regular batch via the UI. **If that workflow exists, this regresses it.**

#### (c) Drop the field entirely
- Schema migration to drop the column + FK + relation.
- Remove all reads/writes/types/UI.
- Backfill any existing rows that have `scorerUserId` set into something else, or accept that legacy batches lose their "scorer" indicator.
- **Risk: high.** Schema migration on prod, can't be reverted cleanly.

### Open questions for Taylor
1. **Which option** — (a), (b), or (c)?
2. **Sanity check on (b)/(c)**: is there any UI workflow or import script that lets an admin manually pick a single scorer for a non-double-scored regular batch?

---

## ⏸️ Pending: #3 — Rate limiting

**Status: deferred until after #7. Needs infrastructure decision.**

No rate-limit library is currently installed. On Vercel serverless, an in-memory limiter is mostly theater (cold starts reset state). Standard fix is `@upstash/ratelimit` + Upstash Redis.

### Plan
1. Install `@upstash/ratelimit` + `@upstash/redis`.
2. Write a wrapper that fails open if `UPSTASH_REDIS_REST_URL` isn't set (so the code can ship before infra is ready).
3. Apply to `/api/invite`, `/api/reset-password`, `/api/login` (or wherever Auth.js routes login attempts), `/api/invite/accept`, `/api/reset-password/accept`.
4. Taylor provisions Upstash Redis + adds `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to Doppler `dev` and `prd` configs.

### Open question
- Is Taylor okay with adding Upstash as a dependency? (Free tier covers what we need at this scale.)

---

## 🆕 Bonus issue noticed during #6 — `/admin/page.tsx` stale status

While doing #6 I spotted a **real UI bug** that wasn't in the original audit:

**Location:** `src/app/admin/page.tsx:72-74`
```tsx
<Badge className={statusColors[project.status] || ''}>
  {project.status}
</Badge>
```

**Problem:** This renders the raw DB `project.status` (which is now confirmed stale, since #6 stopped anyone writing to it). On a project where all batches are RECONCILING, the project list still shows "SETUP" because the DB column was never updated.

**Fix:** Compute `displayStatus` the same way `project-detail-client.tsx:462-467` does — derive from the project's batch statuses. To do this server-side here, the admin page already has a `Project` query; just include `batches: { select: { status: true } }` and apply the same reduction.

**Want this as a separate commit?** If yes, it's ~20 lines and slots in cleanly between any of the pending items. Not blocking anything else.

---

## How to resume

When Taylor picks this back up:

1. **Read this doc.**
2. **Push the four pending commits** if they haven't been pushed yet:
   ```
   git log --oneline origin/main..HEAD   # should still show the 4 commits
   git push
   ```
3. **Decide on #7's option** (a/b/c) and answer the sanity-check question.
4. **Decide on #3** — okay to add Upstash dep?
5. **Decide on bonus issue** — fix `/admin/page.tsx` stale status now or later?
6. Then have Claude proceed in this order: #7 → bonus (if yes) → #3.

The audit chat history has the original findings + my synthesis with severity levels and file:line refs. CLAUDE.md is the canonical project context.
