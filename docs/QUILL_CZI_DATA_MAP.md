# Quill/CZI — External Data Map (pointer)

The Quill/CZI annotation→evaluation **data landscape** — the Google Sheets inventory, the
feedback-writer vs annotator layers, file IDs, the first human inter-rater-reliability (IRR) read,
and the per-activity structure — is documented in **leanlab-larry** (source of truth):

```
~/TAYTAY/CODE/Leanlab Automation/Leanlab-Larry/projects/quill-czi/data-pipeline-and-irr-2026-06-02.md
```

## Why it matters here
This app is the future home of the **annotation/evaluation** work currently done in Google Sheets.
Notes relevant to the data model:

- The current annotation data is **long format** (one row per item×dimension), 8 binary dimensions
  with keys `is_appropriate_feedback`, `is_task_aligned`, `is_not_answer_giving`,
  `is_actionable_revision`, `is_manageable`, `is_anchored_in_student_response`,
  `is_acknowledges_strength`, `is_appropriate_emotional_pitch`. Score tokens `1--Yes`/`0--No`/blank.
- **Two layers**: feedback writers (per-activity `Feedback Template_<Name>` sheets) vs annotators
  (who score the feedback). Neither carries the activity **source passage** — it's external context.
- `FeedbackItem` here stores feedback + scores keyed by `activityId` and a `FeedbackSource` (AI vs
  HUMAN); AI feedback in the sheets carries `Teacher_ID = 999`.
- First-pass human IRR is low (overall Fleiss κ ≈ 0.22) → **reconciliation** is the key next step,
  and it's the workflow this app should own going forward.

Full file inventory, IDs, and the IRR table live in the leanlab-larry doc above. Those Google Sheets
are **live and read-only** (Amber / annotators / CZI use them) — never write to them programmatically.

## First AI-vs-human result (2026-06-02)

Signal Studio ran an LLM-as-judge (Opus, the 8 single-dimension prompts) over the COMPILED annotation
rows and compared to the 6-annotator human majority. Crucially the judge got **no source passage**
(matching the annotators) — confirming source text isn't needed for this app's data either. Partial
run (120/186 rows, 4 dims reached): **~90% agreement** with the human majority (Not Answer Giving 93%,
Manageable 88%, Emotional Pitch 100%, Anchored 82%). Caveat: % agreement, not chance-corrected; the
human ceiling itself is low (κ≈0.22), so reconciliation — the workflow this app should own — remains
the gating step before the gold is firm. Details in the leanlab-larry doc.
