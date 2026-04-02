# CLAUDE.md — Writing Evaluator

## What This Is

A standalone blinded, rubric-based scoring tool for evaluating written feedback quality (human vs AI-generated). Built for Leanlab's Quill/CZI project. External collaborators (Amber Wang at Quill, CZI) will use this tool.

**Not part of StudyFlow.** This is a separate repo with its own auth, database, and deployment.

## Git Commits

**Never add `Co-Authored-By` lines to commit messages.** Taylor is the sole author.

## Development Philosophy

Same as StudyFlow: **do it right the first time.** No bandaid fixes, no duplicated logic, no silent failures.

**Server/client boundaries matter.** This project was explicitly built with proper Next.js 15 server/client component separation:
- Server components handle auth checks + Prisma data fetching (no loading spinners, no API round-trips for initial page loads)
- Client components handle interactivity (forms, dialogs, scoring UI)
- Pages are thin server wrappers that pass data as props to client components
- Use `router.refresh()` after mutations to re-render server components with fresh data
- Use `<Link>` over `router.push` for navigation in server components

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Database**: Neon PostgreSQL via Prisma v7 + `@prisma/adapter-neon`
- **Auth**: Auth.js v5 (next-auth@beta) with Credentials provider, JWT strategy
- **UI**: Tailwind CSS v4 + shadcn/ui (Base UI)
- **Language**: TypeScript 5

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # ESLint
npx prisma generate  # Regenerate Prisma client after schema changes
npx prisma db push   # Push schema changes to Neon (no migration files)
npx tsx scripts/seed.ts  # Seed admin + test evaluator users
```

## Database

- **Provider**: Neon (project: `writing-evaluator`, region: `aws-us-east-2`)
- **Host**: `ep-dark-moon-aedx88jy.c-2.us-east-2.aws.neon.tech`
- **DB name**: `neondb`, **User**: `neondb_owner`
- **Connection string**: In `.env` (gitignored)
- **Prisma schema**: `prisma/schema.prisma`
- **Prisma config**: `prisma/prisma.config.ts` (required for Prisma v7 — datasource URL configured here, not in schema)
- **Generated client**: `src/generated/prisma/` (gitignored, regenerate with `npx prisma generate`)

### Prisma v7 Specifics
- The schema's `datasource db` block has NO `url` — the URL comes from `prisma.config.ts`
- `db.ts` uses `@prisma/adapter-neon` driver adapter (NOT the default Prisma engine)
- For standalone scripts, import from `../src/generated/prisma/client.js` (there's no `index.ts`)

### Schema Overview

```
User              — email, hashedPassword, role (ADMIN | EVALUATOR)
Project           — name, status (SETUP → ACTIVE → RECONCILIATION → COMPLETE)
RubricDimension   — per-project scoring criteria with configurable scales
FeedbackItem      — imported from CSV (studentText, feedbackText, feedbackSource, teacherId, conjunctionId, optimal, feedbackType)
ProjectEvaluator  — M:M join between projects and evaluators
Assignment        — which evaluator scores which items
Batch             — groups of items with type (REGULAR | CALIBRATION), activity/conjunction filters
BatchAssignment   — evaluator ↔ batch with scoringRole (PRIMARY | DOUBLE)
EvaluatorTeam     — pairs of evaluators assigned to specific rubric criteria
EvaluatorTeamMember    — team ↔ user join
EvaluatorTeamDimension — team ↔ dimension join
Score             — individual dimension scores with timing data
```

Key relationships:
- `feedbackSource` is an enum: `AI` or `HUMAN` — hidden during scoring (blinded), revealed only on export
- Rubric dimensions are rows in the DB, not hardcoded columns — fully configurable per project
- `Score` has a unique constraint on `[feedbackItemId, userId, dimensionId, isReconciled]`

## Auth

- **Auth.js v5** with Credentials provider (email + bcrypt password)
- **JWT strategy** (no database sessions)
- **Middleware** (`src/middleware.ts`) protects all routes except `/login`, `/api/auth`, and static assets
- **Role check**: Server components use `const session = await auth()` then check `session.user.role`
- **Roles**: `ADMIN` (manages projects, imports data, configures rubrics) and `EVALUATOR` (scores items)

### Test Accounts
| Email | Password | Role |
|-------|----------|------|
| admin@leanlab.org | admin123 | ADMIN |
| evaluator@test.com | eval123 | EVALUATOR |

## Project Structure

```
src/
├── app/
│   ├── page.tsx                          # Server: evaluator dashboard (redirects ADMIN → /admin)
│   ├── login/page.tsx                    # Client: login form
│   ├── layout.tsx                        # Root layout with SessionProvider
│   ├── admin/
│   │   ├── page.tsx                      # Server: admin project list + CreateProjectDialog
│   │   └── [projectId]/
│   │       ├── page.tsx                  # Server: project detail → ProjectDetailClient
│   │       └── import/
│   │           ├── page.tsx              # Server wrapper → ImportClient
│   │           └── import-client.tsx     # Client: CSV drag-and-drop import
│   ├── evaluate/
│   │   └── [projectId]/
│   │       ├── page.tsx                  # Server wrapper → EvaluateClient
│   │       └── evaluate-client.tsx       # Client: full scoring interface
│   └── api/
│       ├── auth/[...nextauth]/route.ts   # Auth.js route handler
│       ├── projects/route.ts             # GET (list) / POST (create)
│       ├── projects/[projectId]/
│       │   ├── route.ts                  # GET (detail with rubric) / PATCH (update status)
│       │   ├── evaluators/route.ts       # GET / POST (add evaluator)
│       │   ├── assignments/route.ts      # POST (assign all items to evaluators)
│       │   └── stats/route.ts            # GET (scored item count)
│       ├── feedback-items/route.ts       # GET (by projectId) / POST (bulk import from CSV)
│       ├── scores/route.ts              # GET (by projectId) / POST (save score)
│       ├── export/route.ts              # GET (CSV export with unblinded feedbackSource)
│       ├── my-projects/route.ts         # GET (evaluator's assigned projects)
│       └── users/route.ts               # GET (list evaluator users for admin)
├── components/
│   ├── create-project-dialog.tsx         # Client: new project form dialog
│   ├── evaluator-dashboard.tsx           # Client: evaluator project cards with progress
│   ├── project-detail-client.tsx         # Client: project tabs (Overview, Evaluators, Rubric, Export)
│   ├── providers.tsx                     # SessionProvider wrapper
│   └── ui/                              # shadcn/ui components
├── lib/
│   ├── auth.ts                           # Auth.js config (providers, callbacks, JWT)
│   ├── db.ts                             # Prisma client with Neon adapter
│   ├── csv-parser.ts                     # CSV parsing + validation for feedback item import
│   ├── rubric-templates.ts               # Default rubric (8 generic criteria, 1-3 scale)
│   └── utils.ts                          # cn() helper
├── types/
│   └── next-auth.d.ts                    # Augments Session type with role + id
├── middleware.ts                          # Auth middleware
└── generated/prisma/                     # Generated Prisma client (gitignored)
```

## Key Workflows

### Admin: Create Project → Import → Configure → Activate
1. Admin creates project at `/admin` → project starts in SETUP status
2. Admin imports CSV at `/admin/[id]/import` — CSV columns: `Response_ID, Student_ID, Cycle_ID, Activity_ID, Conjunction_ID, Student_Text, Feedback_Source, Teacher_ID, Feedback_Text, optimal, feedback_type, Feedback_ID`
3. Rubric auto-created from `DEFAULT_RUBRIC` template (8 generic criteria, 1-3 scale each)
4. Admin adds evaluators (existing users) and assigns all items
5. Admin changes status to ACTIVE → evaluators can now score
6. After scoring: RECONCILIATION → resolve discrepancies → COMPLETE → export CSV

### Evaluator: Score Items
1. Evaluator logs in → sees assigned projects at `/`
2. Clicks "Start Evaluating" → goes to `/evaluate/[projectId]`
3. Split-pane UI: left shows student response + feedback text, right shows rubric scoring
4. Score all dimensions (1-3 scale per dimension) → Save & Continue → auto-advance
5. Navigation: numbered circles show scored / current / unscored (semantic color tokens)
6. Timing: records `startedAt` and `durationSeconds` per item

### Export
- Admin exports CSV from project detail page (Export tab)
- Export **reveals** `feedbackSource` (AI/HUMAN) — this is the unblinding step
- Output columns: all input columns in original order, then `Score_ID, Evaluator_ID, Criterion_1…Criterion_N` (dimension labels as headers)

## Default Rubric

8 generic criteria (`Criterion 1` through `Criterion 8`), all 1-3 scale.
Score labels: 1 = Not Present, 2 = Unclear, 3 = Present.
Criteria may be renamed to project-specific names via the Rubric tab.

## Design System

Full reference: `docs/DESIGN_SYSTEM.md`

**Key rules for all future development:**

1. **Never use hardcoded Tailwind colors** (no `zinc-*`, `blue-*`, `green-*`, etc.) — always use semantic tokens (`text-foreground`, `bg-background`, `text-muted-foreground`) or domain tokens (`bg-status-active-bg`, `bg-score-high-solid`, `text-success`, `text-destructive`)
2. **Status badges**: Import `statusColors` from `src/lib/status-colors.ts` — never define inline
3. **Scoring colors**: Use `getScoreColor()` / `getSelectedScoreColor()` in evaluate-client — they return semantic token classes
4. **Content cards**: Use `bg-content-student-*` / `bg-content-feedback-*` tokens for the split-pane evaluation view
5. **Dark mode is automatic** — just use semantic tokens and it works. Both `:root` and `.dark` are fully defined in globals.css
6. **All interactive elements**: Add `transition-all duration-200`
7. **All authenticated pages** must include `<NavHeader />` at the top
8. **Frosted glass nav**: `bg-background/80 backdrop-blur-lg supports-[backdrop-filter]:bg-background/60 border-b border-border`
9. **Page containers**: Use `py-10` consistent padding
10. **Card hover**: `hover:shadow-sm hover:ring-1 hover:ring-primary/10`

## Environment Variables

```
DATABASE_URL=postgresql://...   # Neon connection string
AUTH_SECRET=...                  # Auth.js session secret
```

## Remaining TODO

- [ ] Initialize git, create GitHub org (`leanlab-education`), create repo (`writing-evaluator`), push
- [ ] Verify production build compiles (may need adapter fixes for Next.js build)
- [ ] Test full end-to-end flow in browser
- [ ] Connect to Replit for non-engineer access
- [ ] Deploy somewhere (Vercel or Replit)
- [ ] Generate a strong `AUTH_SECRET` for production

## People

- **Taylor Haun** — building this tool (taylorhaun@leanlabeducation.org)
- **Amber Wang** — lead researcher for Quill/CZI studies (amberwang@leanlabeducation.org)
- **Katie Boody Adorno** — CEO, signs contracts (katie@leanlabeducation.org)
