# Quill Evaluation Tool — Meeting Notes (2026-03-18)

## Attendees
- Taylor Haun (Leanlab)
- Amber Wang (Quill/CZI)

## Decisions

### UI Changes
- Remove Reading Passage from evaluator view
- Remove Prompt field (prompt will be attached to student response during data cleaning)
- Keep Activity label visible
- 6 dimensions now (up from 5), with 3-4 scoring options each
- Add notes section for evaluators
- Add back button

### Batching Overhaul
- ~200 items per batch (potentially smaller)
- Batches scoped to one Quill activity + one prompt type (reduces evaluator fatigue)
- Admin (Amber) needs flexibility to set/reorganize batch sizes
- Dashboard to show batch breakdown

### Data Pipeline
- Level 1 (Quill student data) + Level 2 (annotator feedback) → Amber cleans/merges in Stata → imports into tool → evaluators score → export as Level 3
- Input format: Response_ID, Student_ID, Cycle_ID, Activity_ID, Prompt_ID, Student_Text, Feedback_ID, Feedback_Source, Annotator_ID, Feedback_Text
- Output format: Score_ID, Feedback_ID, Evaluator_ID, Dimension_1-6, plus carried-through input fields

### Hidden Fields (stored but not shown to evaluators)
- Feedback_Source (Human / AI) — core blinding
- Annotator_ID (dummy code 999 for AI-generated)

### Admin View
- Assign evaluators to batches of feedback to score
- Batch breakdown dashboard

### Evaluator View
- How many items assigned
- How many items scored
- Auto-save — never lose progress

### Other
- Amber handles data cleaning/merging in Stata before import
- Activity ID needed so tool can present correct contextual info for evaluators
- Amber will work with Rachel to ensure proper activity tracking for cycles 2 and 3
- Open question: how to define high-quality feedback standards (Quill's flagging system, annotator disagreement)
- Taylor to build and share via GitHub repo (open source, LeanLab org)

## Next Steps
- Amber: Send example input/output data (including fake data rows)
- Taylor: Remove reading passage and prompt from evaluator UI
- Taylor: Update interface for flexible batch sizes, organized by activity + prompt type
- Taylor: Build next version based on discussed formats and share for async review
- Amber: Drop example data on Quill thread
- Taylor: Invite team members to LeanLab GitHub repo when ready

## Meeting Summary

Admin portal has two views: admin view for setting up evaluators and batches, evaluator view for scoring tasks and progress. Batches of ~200 items based on plan assuming 5 evaluators and ~10,000 total feedback items. Auto-save is critical.

Data structure involves merging L1 student data (from Quill) with L2 feedback. L1 includes student responses, Quill student IDs, and activity IDs. Amber confirmed she will work with Rachel on proper activity tracking for cycles 2-3.

Interface based on Zach's StudyFlow UI with modifications. Evaluators see: Activity label, Student Response, Feedback to Evaluate, and 6 scoring dimensions. They do NOT see: Reading Passage, Prompt, Feedback Source, Annotator ID.

Batches limited to one Quill activity + one prompt type to reduce mental fatigue. Admin can adjust batch sizes and reorganize as needed.

End-to-end workflow: Quill data → Amber cleans/merges in Stata → imports into evaluation tool → evaluators score → export as L3 data. Feedback from human and AI annotators merged into unified dataset with blinding maintained during scoring.
