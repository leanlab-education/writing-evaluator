# Meeting Notes — 2026-04-09

**Attendees:** Amber, Taylor, Rachel
**Topic:** Annotation Platform iteration (Quill/CZI writing evaluator)
**Source:** Zoom AI Companion summary (full transcript pending)

## Quick recap
Demo of recent features (batching, discrepancy identification, reconciliation). Team clarified the distinction between three batch types:
- **Training** — all coders score all criteria to establish familiarity (renamed from "Calibration")
- **Double-coded** — for establishing inter-rater reliability
- **Independent** — for individual scoring after reliability is established

Team decided:
- Pairs schedule meetings to resolve discrepancies; admins can serve as third-party adjudicators when needed
- Process data in **rolling batches by activity** rather than all at once
- Simplify drift check by relying on **double-coding requirements per activity** rather than separate periodic checks

## Taylor's action items

### Rename & batch type
- **Rename "Calibration" → "Training"** to avoid confusion with IRR calibration
- Restore/add Training batch type — all coders score all 8 criteria for a set of feedback

### Rolling upload + batching
- Allow rolling uploads — import and batch new files as they become available, **without overriding previous batches**
- Support adding new data subsets (by activity) on top of existing batches
- `Activity_ID` is non-unique; `Feedback_ID` is unique within each activity
- Expect many batches per project

### UI improvements
- Reduce height of batch tiles
- Filter by Activity ID and Conjunction ID (already done)
- Ensure new uploads are batched separately from existing

### Assignment + reconciliation
- Support assigning batches to either one or two people
- Reconciliation/discrepancy view triggered whenever more than one person is assigned to a batch

### Notes / justification
- Add optional notes field for coders when scoring (clearly labeled as optional)
- Notes visible in discrepancy/reconciliation view when present
- Three-box model: Coder 1 notes (read-only) + Coder 2 notes (read-only) + Reconciliation notes ("why we decided what we did")

### Escalation
- Mechanism for coders to escalate unresolved discrepancies to an admin/adjudicator
- Admins can assign or be assigned as adjudicators for specific batches
- **One adjudicator per batch**; Amber and Rachel take turns across teams

### Research + iteration
- Review Rayyan and Abstractor for batch assignment, reconciliation, and UI inspiration
- Prepare next iteration based on feedback
- Schedule a test run with the team

## Others' action items
- **Amber:** Create a smaller test data set; test new project + batching features; send meeting transcript to Taylor
- **Rachel:** Offer additional/dummy data from other Reading for Evidence activities if needed for testing
- **Team:** Decide and communicate whether to implement periodic drift checks or rely on per-activity double coding (Slack or next meeting)

## Key decisions

### Coding process
- **80% threshold** for double-coding validation — coders must achieve this on 20% of the data before proceeding to independent scoring
- Training phase: 8 people score 50 pieces of feedback against all 8 criteria; team later selects which criteria to keep for the final version
- Then raters are assigned to specific criteria pairs and establish IRR on those two criteria

### Three batch types (final)
1. **Training** — 8 coders × all 8 criteria × ~50 items
2. **Double scoring** — 20% of data for reliability check (per activity)
3. **Independent scoring** — after double scoring meets the 80% threshold

### Drift check decision
- **Not implementing a separate drift check feature**
- Double-coding by activity naturally serves as a rolling drift check
- To be confirmed with the broader team in Slack

### Reference tools to evaluate
- **Rayyan** — systematic review screening tool with blinded independent review, custom labels, AI-assisted ranking
- **Abstractor (Data Abstraction Assistant)** — side-by-side source + coding form
- **Covidence** (Taylor's addition) — closest match to the full workflow including IRR + escalation to third reviewer + "conflict resolution doesn't affect IRR score" rule

## Post-call Slack notes (Amber + Rachel)

Amber's structured recap (3:42 PM):

**Batching big ideas:**
1. Import files/data iteratively (ability to create new batches as needed)
2. Create batches by Activity_ID and Conjunction_ID, with ability to adjust bin sizes and **randomize by Feedback_Source**
3. Annotator batch assignment categories:
   - **Training** — assigns batch(es) to ALL annotators, who score feedback against ALL rubric criteria
   - **Independent** — assigns batch to designated individual, who scores against their 2 assigned criteria
   - **Double-Scored** — assigns batch to both individuals, where each scores against their 2 assigned criteria
4. Double-scored batches should later have Reconciliation view (check for discrepancies)
5. Allow assignment of adjudicator (third person: Amber or Rachel)
6. Add notes feature

**Nice-to-haves:**
- Admin control over when an annotator can see a batch (visibility gating)
- Reconciliation view: "Need Adjudicator" button
- Annotator view shows batch type label ("Training", "Double", "Independent")

**Rachel's clarification (3:44 PM):**
- Double-Scored comes BEFORE Independent chronologically — not intended to be a sequence in the list, but worth noting
- Amber: this ordering can be enforced via the admin visibility control (nice-to-have above) — hide Independent batches until Double-Scored IRR passes

## Key nuances from the full transcript (extracted 2026-04-09)

These are things the AI summary missed or softened that matter for implementation.

### The three-notes-box model was explicit
Amber (00:07:26): "a third notes box, like a fresh one for, here's why we decided the way we did." Then confirmed: "that new notes box is when they're looking at it together."

So: Coder 1 original notes + Coder 2 original notes + Reconciliation notes. Confirmed verbatim.

### Why notes matter (Rachel's reasoning, 00:05:49)
"It's also really hard to remember later, why did I score that one like that? And given the amount that they've got [to score]..."

Notes are for **memory aid during reconciliation**, not justification. Most scores will be blank — "clearly label it, like, only useless if needed" (Amber 00:06:13).

### CZI wants rationale attached to final scores (Amber 00:05:00)
CZI said annotation thoughts paired with the score "could be helpful" but "we wouldn't really want to hand them their thinking when it's not the final score." This validates the reconciliation notes box specifically — it's the only one that goes with the final score in the export.

### Independent scoring NEVER happens before Double-Scored (Rachel 00:33:53)
**"They shouldn't independently score anything. [Post]"** — Rachel cut in with force. This is absolute. Everything starts double-scored. Independent only unlocks after IRR is established.

Rachel's reasoning (00:34:35): "if they see [independent batches] and score independently and their reliability's crap, they're gonna have to go back and [rescore]."

Amber's fallback (00:34:38): "if that's too hard [to hide], then we can always just tell them very clearly, hey, look for the tiles that say double score and do those first, but ideally, like, they wouldn't even see the [independent ones]."

**Design implication:** Visibility control (hiding) is the ideal; batch type labels on tiles are the acceptable fallback. Build both, let admins pick.

### Drift check is DEAD (Rachel 00:37:34)
**"So yeah, so I think we can throw away this drift check idea based on that."**

Reasoning: if we double-code 20% PER ACTIVITY (not per project), each new activity naturally re-establishes reliability. Each activity has different source text ("whales" vs another topic), so context shifts anyway, so per-activity checks handle drift organically.

**Not deferred. Not future. Dropped.**

### 20% IRR threshold is soft, not firm (Amber 00:14:47)
Rachel: "What's our threshold, actually? Have we decided that?" Amber: "I don't think so." Then: "I think 80's fine, given that it's, like, 0 versus 1, and exact match, like, 80% seems very doable."

This is a live decision made on the call, not a settled spec. If 80% turns out to be too strict or too loose in practice, adjust without asking. Worth making it a project-level config variable rather than hardcoded.

### The training batch type is currently broken/hidden (Amber 00:33:01)
**"I thought I, before I had seen, like, that third batch type, like, what used to be called calibration, but is now training. I wanted to name that, that that should probably pop back up, because when it's the training, that's when it has all 8 criteria, right? I could have sworn I saw that before, but I think it disappeared."**

**NEW ACTION ITEM:** Before renaming Calibration → Training, investigate why the Calibration batch type option is no longer visible in the batch creator UI. Fix or restore it.

### Rolling upload granularity is per (activity, conjunction), not per activity (Amber 00:28:50)
Amber will upload whale/because separately from whale/but when each finishes. So the rolling upload UX needs to support filtering imports by BOTH activity and conjunction, not just activity.

### Batch type is nearly redundant with assignee count (Taylor 00:30:53)
Taylor: "maybe double is kind of dumb? Maybe? Like, maybe it just needs to be, like, it's either assigned to one person or it's assigned to two people."

Amber's response: keep Double as an explicit type so the system knows when to trigger reconciliation. Then clarifies: "anytime there's two or more people, we need that reconciliation view."

**Design implication:**
- **Training** is structurally different (all coders, all 8 criteria) — needs its own type
- **Double-Scored** vs **Independent** is functionally derivable from assignee count (1 = Independent, 2 = Double-Scored)
- Keep the enum for clarity in reporting/labels, but the reconciliation trigger rule should be "assignee count > 1" — not "batchType = DOUBLE". This is more robust and matches Amber's instinct.

### Broader vision (Rachel 00:38:49)
"I also just was like, this is just, honestly, this could be really valuable to just qualitative researchers in general. All the qualitative analysis tools are bonkers expensive. If you could give education researchers a free tool..."

This tool has value beyond Quill/CZI. Something to keep in mind for future generalization (but not a near-term priority).

### UX friction noted: "Double" assignment is awkward (Taylor 00:30:19)
Currently adding a second evaluator to make a batch "Double" requires clicking a plus sign. Taylor observed: "Hmm, that's awkward. That's difficult." Fix as part of the batch creator cleanup.

## Meeting sections
- Retirement Perspectives Discussion (chat preamble)
- Annotation Platform Updates Discussion
- Coders' Notes and Reconciliation Process
- Annotation Escalation Process Implementation
- Coding Process and Quality Control
- Rater Training and Calibration Process
- Data Scoring Process Optimization
- Rolling Batch Data Processing System
- New Batch System Implementation Discussion
- UI Improvements and Feedback Assignments
- Data Scoring System Development Plan
