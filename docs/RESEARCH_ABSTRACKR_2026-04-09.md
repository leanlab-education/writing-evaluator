# Abstrackr — Research Report

**Date:** 2026-04-09
**Source:** Web research + GitHub help template (bwallace/abstrackr-web)
**Context:** Amber and Rachel mentioned Abstrackr as a similar tool during the 4/9 meeting. Taylor asked for a deep-dive to see what we can learn and whether to get a login.

---

## What it is

Abstrackr is a free, open-source web app from Brown University's Center for Evidence Synthesis in Health that helps research teams collaboratively screen citations during systematic reviews. It's the closest structural analogue to the writing-evaluator in the systematic-review space, and it's been around for 10+ years so its design has been stress-tested by real research teams.

**Core job:** thousands of citations come in from a literature search → researchers label each as include / exclude / borderline → machine learning ranks remaining citations by likely relevance → exports labeled data for downstream analysis.

**Roles:** Project Lead (owns the review, resolves conflicts, runs exports) and Reviewers (do screening work on assignments).

---

## Workflow, in detail

### 1. Project creation (Project Lead)
- Upload source citations from PubMed IDs, EndNote RIS, tab-separated files (mandatory: `id`, `title`, `abstract`; optional: `keywords`, `authors`, `journal`), or Reference Manager XML
- Pick a **screening mode** — this is the key design decision:
  - **Single** — each citation screened by one reviewer
  - **Double** — every citation screened by two reviewers (who never re-screen the same one)
  - **Advanced** — manual work distribution for custom scenarios
- Set **abstract ordering** — default is "most likely relevant first" via ML
- Optional **pilot round** — specify `n > 0`, and ALL reviewers screen the same `n` citations before individual assignments begin. Used for team training and calibration before splitting work.

### 2. Reviewers join
- Lead generates a unique join URL and sends it out
- Reviewers click the link → automatically added to the project, no manual registration

### 3. Reviewer dashboard
- Two tabs: **My Work** (assignments, outstanding first, then completed) and **My Projects**
- Click a work item → enters the screening interface

### 4. Screening interface — three panels
- **Panel A: Basic Labeling** — classify abstract as "relevant," "borderline," or "irrelevant." System auto-advances to next abstract on click.
- **Panel B: Term Labeling** — highlight keywords with strength indicators. "One thumb up" = weak signal, "two thumbs" = strong. Terms get color-coded in the abstract. Reviewable/deletable later.
- **Panel C: Tagging** — apply flexible categorical tags (e.g., "RCT", "pediatric") that toggle on/off and export alongside the main label.
- **Notes** — draggable dialog window for general or PICO-structured observations. Only appears when invoked.

### 5. Conflict resolution (Lead-only)
- Dedicated mode for the Project Lead that surfaces abstracts with conflicting reviewer decisions
- Lead applies a "consensus" label that overrides the conflicting originals
- Separate "review maybes" mode handles the borderline pile

### 6. Adding more citations mid-project
- Lead uploads additional files later
- **System automatically deduplicates using PubMed IDs**
- No overwrite — new items append, duplicates get flagged

### 7. Export
- Downloadable CSV with internal ID, source ID, PubMed ID, citation metadata, and all labels
- Label encoding: `-1` exclude, `1` include, `0` borderline, `o` missing
- **Consensus rules on export:**
  - Explicit consensus label takes priority
  - Unanimous multi-reviewer agreement → counts as consensus
  - Unresolved conflict → marked `x`
  - Single-reviewer (no consensus needed) → marked `o`

### 8. ML-assisted screening
- As reviewers label items, a classifier learns from decisions
- Unscreened items get ranked by likely relevance
- Workload savings in published evaluations: median **67%**, range 10%–88%
- Sensitivity stayed above 0.75 in all projects (no included items missed)

---

## Structural comparison to writing-evaluator

| Abstrackr | Writing Evaluator | Notes |
|---|---|---|
| Single-Screen mode | Independent batch | 1 reviewer per item |
| Double-Screen mode | Double-Scored batch | 2 reviewers per item, IRR flow |
| **Pilot round** | **Training batch** | **Exact match.** Everyone scores the same starter set. Validates the redesign. |
| Project Lead resolves conflicts | Pair-first, then escalate to adjudicator | Your design is MORE flexible |
| "Consensus" label overwrites conflicts | Reconciled Score row (`isReconciled=true`) | Both preserve original scores; your audit trail is cleaner |
| Include/Exclude/Borderline (3-value) | 1-3 rubric per dimension × 8 dimensions | Yours is much richer |
| Flexible tags layered on labels | — | Not present in yours; could inspire a "flag" feature |
| Notes as draggable dialog | Inline Textarea (bottom of rubric) | Their dialog UX matches your "only use if needed" philosophy better |
| Machine learning relevance ranking | — | Not needed for your use case |
| Dedupe on ID when adding more citations | Rolling uploads (planned) | **Direct answer to Question 1** — they dedupe by PubMed ID, you'd dedupe by `Feedback_ID` |
| Add citations mid-project | Rolling uploads (planned) | Exact same feature, same UX pattern |
| Real-time IRR tracking | Discrepancy report CSV | Yours is export-only; theirs is live dashboard |

---

## Key lessons we can learn / steal

### Structural validation (no new work needed)
1. **Your three batch types are the correct pattern.** Training / Double / Independent maps 1:1 to Abstrackr's Pilot / Double / Single. This isn't novel — it's a well-established systematic-review pattern, battle-tested for 10+ years.
2. **Rolling uploads with dedup-by-ID is the standard.** Abstrackr's "add citations later + auto-dedupe by PubMed ID" is literally the design for your Question 1. **Skip duplicates by `Feedback_ID`, don't update existing items, surface the skip count to the admin after import.** No need to invent.
3. **Preserving original scores while applying a consensus/reconciled label is standard.** Validates your `isReconciled` boolean + `reconciledFrom` audit trail design.

### UX patterns worth stealing

4. **Notes as a draggable dialog, not inline.** Abstrackr's Notes are hidden behind a button and appear as a draggable, dismissable dialog. This directly matches Amber's "only use if needed, most will be blank" requirement. Your current inline Textarea takes visual real estate every time, even when unused. **Worth refactoring** — add a "Notes" button that opens a small dialog. Much cleaner.

5. **Two-tab dashboard: "My Work" vs "My Projects".** Abstrackr separates the action-oriented view (outstanding assignments) from the browse view (all my projects). Your evaluator dashboard could do this if it gets crowded, but probably fine as-is.

6. **Join-by-URL onboarding.** Abstrackr uses unique join URLs for reviewers — no manual registration. You already have this with StudyFlow magic links. ✓

7. **"Consensus" mode UI.** Abstrackr has a dedicated view the Lead enters to resolve ALL conflicts at once, not item-by-item. This matches Amber's "batch-at-a-time reconciliation" preference from 4/7. Your current reconcile UI already does this per-batch, but worth checking the UX against theirs.

### Features worth considering (nice-to-have, not urgent)

8. **Real-time IRR dashboard.** Abstrackr shows Kappa / agreement % as reviewers work, not just at export time. This could help Amber/Rachel monitor team progress without downloading a CSV. Could be a small admin-facing widget on the batch detail page.

9. **Flexible tags separate from scores.** Their tagging panel lets reviewers flag an item without changing its score ("needs discussion", "unclear feedback", "bad data"). Could be useful for your team — a single "flag" button that admins see in a queue, independent of rubric scores. Separate from notes; more structured.

10. **ML-ranked abstract ordering.** Out of scope for you (you're scoring everything, not prioritizing relevance). Not useful.

### Things NOT to copy

11. **Lead-only conflict resolution.** Abstrackr's rigid "only the Lead resolves" is less flexible than your pair-first-then-escalate design. Yours lets the team self-resolve most discrepancies, reducing the bottleneck on Amber/Rachel. Keep yours.

12. **Borderline / "maybe" labels.** Adds a third value to otherwise binary decisions. Your 1-3 rubric doesn't need this — it's already a scaled value. Skip.

13. **Abstrackr's export label encoding** (`-1/0/1/o/x`). Opaque and domain-specific. Yours uses real rubric column names, which is more legible. Keep yours.

---

## Should Taylor get a login?

**Yes.** Specifically because:

1. **It's free and open-source** — no cost, no risk
2. **30 minutes of hands-on is worth more than a full research report** for UX questions. Specifically, look at:
   - **Notes dialog UX** — how it opens, how it feels, how it handles blank state
   - **Pilot round → Double-screen transition** — how the tool handles the Training → Double handoff (mirrors your Training → Double → Independent progression)
   - **Project Lead's conflict-resolution view** — what fields are shown, how the Lead adjudicates
   - **Rolling upload of additional citations** — what the dedup UX looks like when duplicates are detected
   - **Real-time IRR dashboard** — is it genuinely useful or noise?
3. **Amber already mentioned it** as a reference point — you can anchor future conversations in a tool she already knows
4. **Brown University / AHRQ-backed** — credentialed research provenance, not a side project

**What to do with the login:**
- Create a dummy project, import a small CSV, invite yourself as a second reviewer via a second account (or use a test email)
- Run through the Pilot → Double workflow end-to-end
- Screenshot anything that sparks a UX idea and drop it into the `docs/` folder
- Share the login workflow with Amber so you both speak the same language during iteration

---

## Sources

- [Abstrackr — Machine Learning-Powered Citation Screening for Systematic Reviews](https://abstrackr.com/)
- [AHRQ Effective Health Care Program — Abstrackr product page](https://effectivehealthcare.ahrq.gov/products/abstractr/abstract)
- [GitHub: bwallace/abstrackr-web (open source repo)](https://github.com/bwallace/abstrackr-web)
- [Abstrackr help documentation (static_pages/help.mako on GitHub)](https://github.com/bwallace/abstrackr-web/blob/master/abstrackr/templates/static_pages/help.mako)
- [Abstrackr: Streamline Your Systematic Reviews — QMed Knowledge Foundation](https://www.qmed.ngo/2025/10/23/abstrackr/)
- [Technology-assisted title and abstract screening for systematic reviews — PubMed](https://pubmed.ncbi.nlm.nih.gov/29530097/)
- [Machine learning for screening prioritization in systematic reviews (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7118839/)
- [Using Abstrackr for Screening — Evidence Synthesis Hub](https://evidence-synthesis-hub.github.io/Agricultural-Evidence-Synthesis-Hub/docs/Abstrackr.html)
