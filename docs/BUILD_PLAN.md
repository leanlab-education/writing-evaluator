# Writing Evaluator — Build Plan & Decisions Log

## Origin

Zach Alstad (fired Feb 2026) built an annotation/evaluation system inside StudyFlow for Quill/CZI. His code was tightly coupled to StudyFlow's auth, schema, and UI. Amber Wang (new lead researcher) has a different spec for how evaluation should work — blinded, rubric-based scoring of feedback quality.

**Decision**: Build a standalone tool rather than extending StudyFlow. Reasons:
- External collaborators (CZI, Quill) need access without StudyFlow accounts
- Different auth model (simple email/password, not Supabase)
- Simpler schema focused solely on evaluation
- Can be shared via Replit for non-engineers to poke around

## Amber's Spec (Source of Truth)

The rubric and workflow come from Amber Wang's evaluation framework:

1. **Feedback pairs**: Each item has a student response + feedback text
2. **Blinding**: Evaluators don't know if feedback is AI or human-generated during scoring
3. **Rubric**: 5 dimensions scored 1-3 (Not Present / Unclear / Present):
   - Affective Support, Alignment, Accuracy, Clarity, Scaffolding/Cognitive Load
4. **Multiple evaluators**: Each item scored by 2+ evaluators for inter-rater reliability
5. **Reconciliation**: Discrepancies (scores differ by > threshold) flagged for resolution
6. **Export**: CSV with unblinded source revealed for analysis

## Architecture Decisions

### Standalone Next.js (not StudyFlow)
- Own repo, own database, own auth
- Can be deployed to Replit for demo access
- No dependency on Supabase, StudyFlow auth, or existing schema

### Prisma v7 + Neon (not Supabase)
- Prisma v7 is the latest, uses `prisma.config.ts` pattern
- Neon free tier is perfect for this tool's scale
- `@prisma/adapter-neon` driver adapter for serverless compatibility
- Schema designed from scratch for evaluation workflow

### Auth.js v5 with Credentials (not Supabase Auth)
- Simple email/password — no magic links, no OAuth needed
- JWT strategy — no session table, no cleanup
- Admin creates evaluator accounts, gives them credentials
- Middleware-based route protection

### Server/Client Component Architecture
Taylor's explicit request: "make sure to do server side vs client side things properly (i didn't do this very well for StudyFlow)"

**Pattern used:**
- Pages are server components that call `auth()` + Prisma queries directly
- Interactive UI extracted into `*-client.tsx` files as client components
- Server components pass initial data as props (no loading spinners on page load)
- Client components manage their own state after mutations
- `router.refresh()` re-triggers server component rendering after data changes

**Example — project detail page:**
```
admin/[projectId]/page.tsx (server)
  → auth() check
  → Prisma: project, evaluators, scored count (parallel)
  → serialize dates to ISO strings
  → <ProjectDetailClient initialProject={...} initialEvaluators={...} />
```

### Configurable Rubric (not hardcoded)
- `RubricDimension` is a DB table, not hardcoded columns
- Each project gets its own rubric dimensions
- `DEFAULT_RUBRIC` template in `src/lib/rubric-templates.ts` seeds the initial 5 dimensions
- Score labels stored as JSON string (`scoreLabelJson`) for flexibility
- Future: admin UI to customize rubric per project

## What's Been Built (Completed)

### Phase 1: Core Scaffolding ✅
- Next.js 16 project with TypeScript, Tailwind v4, shadcn/ui
- Prisma v7 schema with all models (User, Project, RubricDimension, FeedbackItem, Assignment, Score, ProjectEvaluator)
- Auth.js v5 config with Credentials provider + JWT
- Middleware route protection
- Login page

### Phase 2: API Routes ✅
All routes built:
- `POST /api/projects` — create project with default rubric
- `GET /api/projects/[id]` — project detail with rubric dimensions
- `PATCH /api/projects/[id]` — update status
- `GET/POST /api/projects/[id]/evaluators` — manage evaluators
- `POST /api/projects/[id]/assignments` — assign all items to all evaluators
- `GET /api/projects/[id]/stats` — scored item count
- `GET/POST /api/feedback-items` — list items / bulk import from CSV
- `GET/POST /api/scores` — get existing scores / save new scores
- `GET /api/export` — CSV export with unblinded source
- `GET /api/my-projects` — evaluator's assigned projects with progress
- `GET /api/users` — list evaluator users (for admin to add to projects)

### Phase 3: UI Pages ✅
- **Home** (`/`) — Evaluator dashboard showing assigned projects with progress
- **Admin Dashboard** (`/admin`) — Project list with create dialog
- **Project Detail** (`/admin/[id]`) — 4-tab view: Overview, Evaluators, Rubric, Export
- **CSV Import** (`/admin/[id]/import`) — Drag-and-drop CSV with validation preview
- **Evaluate** (`/evaluate/[id]`) — Split-pane scoring interface with rubric

### Phase 4: Server/Client Refactoring ✅
All pages refactored from monolithic `'use client'` to proper server/client split:
- `page.tsx` files are server components (auth + data fetching)
- Interactive bits extracted to client components
- No more `useSession` + `useEffect` auth redirect patterns
- No more loading spinners for initial page loads

### Phase 5: Database Setup ✅
- Neon project created (`writing-evaluator` in `aws-us-east-2`)
- Schema pushed with `prisma db push`
- Admin + test evaluator seeded

## What's Left (TODO)

### Immediate (before sharing)
1. **Initialize git** — `git init`, create `.gitignore`, initial commit
2. **Create GitHub org** — `leanlab-education` org (manual step in browser)
3. **Create repo** — `writing-evaluator` under the org, push
4. **Fix production build** — `npm run build` fails because Prisma tries to instantiate at build time for static page collection. Need to handle the `PrismaNeon` adapter initialization gracefully when `DATABASE_URL` isn't available at build time (or configure Next.js to skip static generation for these pages)
5. **Test end-to-end** — Login → Create project → Import CSV → Add evaluator → Assign items → Score items → Export
6. **Generate production AUTH_SECRET** — replace placeholder in `.env`

### Deployment
- **Option A: Vercel** — familiar, free tier works, env vars easy to set
- **Option B: Replit** — import from GitHub, set secrets, anyone with link can try it
- **Both can work** — deploy to Vercel for production, Replit for demo/collaboration

### Future Features (not MVP)
- Admin UI to customize rubric dimensions per project (currently only default template)
- Reconciliation workflow (compare evaluator scores, flag discrepancies, resolve)
- Bulk user creation (CSV import of evaluators)
- Inter-rater reliability statistics
- Dashboard analytics (scoring speed, agreement rates)
- Email invitations for evaluators (currently admin shares credentials manually)

## CSV Format

Import CSV must have these columns:
```
cycle_ID,student_ID,student_response,feedback_ID,annotator_ID,feedback_text,feedback_source
```

- `cycle_ID` — optional, groups items by evaluation cycle
- `student_ID` — required, identifies the student
- `student_response` — required, the student's original work
- `feedback_ID` — required, unique identifier for this feedback
- `annotator_ID` — optional, who wrote the feedback
- `feedback_text` — required, the feedback being evaluated
- `feedback_source` — `AI` or `HUMAN` (hidden during scoring)

## Known Issues

1. **Build-time Prisma error**: `PrismaClient needs to be constructed with a non-empty, valid PrismaClientOptions` — happens during `npm run build` because Next.js tries to statically analyze pages that import Prisma. Fix: either make all DB-using pages dynamic (`export const dynamic = 'force-dynamic'`) or lazy-init the Prisma client.

2. **`icon-sm` Button variant**: The evaluate page uses `size="icon-sm"` on nav buttons — this may not exist in the default shadcn Button variants. Need to either add it or change to `size="sm"`.

3. **Date serialization**: Prisma Date objects can't be passed as props from server to client components. All dates must be `.toISOString()` before passing. This is handled in the server components but could be a gotcha when adding new pages.

4. **No `index.ts` in generated Prisma**: Prisma v7 generates `client.ts` not `index.ts`. For standalone scripts (like `seed.ts`), import from `../src/generated/prisma/client.js`. For app code, the `@/generated/prisma` path alias works because Next.js resolves it.
