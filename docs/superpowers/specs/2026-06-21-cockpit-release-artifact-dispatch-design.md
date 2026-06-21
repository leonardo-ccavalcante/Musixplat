# Cockpit Release → Artifact Dispatch (Feature 1a) — design

> Status: DRAFT for operator review (2026-06-21). Brainstormed with Leo this session.
> Area: P02 Autonomy Cockpit. Companion screen to the redesigned `/cockpit` (branch `design/cockpit`).

## Problem

Today, pressing **Release** on an NBA in the Autonomy Cockpit records a `Decision_Trace`
inline and shows "Released ✓ trace …" — and stops there. The operator never sees **what
actually gets sent to the restaurants**, **how many** restaurants it reaches, or gets to
**review the artifact** before it goes out. Releasing an autonomy decision and dispatching
the resulting artifact are conflated into one invisible click.

This feature makes the dispatch explicit: Release opens a dedicated screen where the
operator sees the reach, reviews the AI-generated artifact for that action, and sends.

## Decisions locked (this session, with Leo)

1. **Seam = a NEW cockpit-owned dispatch flow** (not reusing the Support 05C
   `Generated_Artifact`). Rationale = blast-radius: `gov.Generated_Artifact` is hard-bound
   to the Support diagnosis (`problem_id NOT NULL → tenant.Diagnosed_Problem`,
   `dossier_ref NOT NULL`, `unique(problem_id, artifact_type)`), produced by
   `server/artifact/generateFromDossier.ts` and consumed by `artifact.ts`/`health.ts`.
   An NBA release has `cohort_id`/`nba_id`, no `problem_id`, no dossier. Reusing it would
   force a schema change to a Support-owned table and **risk colliding with the other git
   currently working on eval/Support.** The new flow is contained in P02.
2. **Artifact = AI-generated content per action type** (A3 promo → offer/email, A6 cancel
   → ops memo, …). The AI drafts the content (like 05C `generateFromDossier`); the human
   reviews and sends. LLM proposes TEXT only, never a number (CLAUDE.md golden rule / §6).
3. **Slice 1a first** = the dispatch spine (reach + generated artifact + send). The
   **experiment A/B layer is 1b** (deferred) — an *optional* path inside the dispatch
   ("Experiment" button), not every dispatch.
4. **Rename `Generated_Artifact` → `Generated_Analysis`** (English per CLAUDE.md §0 — NOT
   "Analisis") to free the "artifact" concept for the cockpit and better name the 05C
   thing (an *analysis* of a diagnosed problem). **Sequencing:** this rename touches the
   Support area; execute it as an isolated migration **coordinated with / after** the
   eval/Support git branch merges, to avoid a rename collision. It is NOT required for 1a
   to ship — 1a names its own entity distinctly and can land first.

## Out of scope (named, not built here)

- **1b — Experiment / A-B design** (control/treatment sizes, 95% confidence, sample-size /
  power calculation, randomization). The 1a screen renders the "Experiment" button as a
  disabled placeholder. Net-new, deterministic stats (§6, TS/SQL, never LLM); its own spec.
- **The `Generated_Artifact → Generated_Analysis` rename execution** — sequenced separately
  (see decision 4). Captured here so it is not forgotten, not done in this plan.
- **Evals/traces visibility** (the "why this level" reasoning + Decision_Trace log) — owned
  by another git this session.

## Functionality

### Runtime workflow

1. In the cockpit queue, the operator clicks **Release** on a `needs_human` NBA.
   - Release no longer writes inline. It **navigates** to `/cockpit/dispatch/:nbaId`.
   - **Pause is unchanged** — it stays inline (a pause dispatches nothing; it clamps
     autonomy and writes its trace as today).
2. The dispatch screen loads (`cockpit.dispatchDetail(nbaId)`): the NBA (action + cohort +
   the `[C]` path), **how many restaurants** it reaches (cohort membership in this pool),
   and the **AI-generated artifact** for this action type, shown as a reviewable draft.
3. The operator reviews and clicks **Send to all N restaurants** (the one primary action).
   - `cockpit.sendDispatch` writes, in ONE transaction: `Release_Batch` + `Decision_Trace`
     (the autonomy release, exactly as `recordRelease` does today — 4-eyes, override-only-
     down, policy pinned, "sin trace no acción") **plus** the new `Action_Dispatch` row.
   - On success → back to the cockpit with confirmation; `cockpit.list` + `weekSummary`
     invalidate (the released NBA leaves the queue; "you released" ticks up).
4. Nothing is persisted until **Send** (write on human click, §3). Cancel returns with no
   write. An NBA already dispatched cannot be re-dispatched (idempotent: `Action_Dispatch`
   unique per nba_id).

### Honesty (§14 / §3)

- The **restaurant count + preview** are READ from `Cohort_Membership_Snapshot` joined to
  the pool's restaurants — never a fabricated number.
- The **artifact content** is PRODUCED (generated at screen load or on demand), shown as a
  **draft pending send** — never presented as "sent" before the human clicks (no fake-green).
- The autonomy NUMBER (`effective_level`) is read, never recomputed; the release re-validates
  server-side (override only down, policy resolved, 4-eyes) — the existing `recordRelease`
  guards are reused verbatim.
- LLM generates the artifact TEXT only; no number it produces is ever a result (§6).

## Design (the screen)

`/cockpit/dispatch/:nbaId` is an **action screen** (DESIGN-STANDARD §1): exactly **one
filled-coral primary** — **Send to all N restaurants**. Everything else is ghost/text.

- **Header** — the action (catalog label + code, e.g. "Propose promo/bonus · A3"), the
  cohort, and the `[C]` path it indicates (dimension measured→standard), reusing the
  cockpit's existing path rendering.
- **Reach** — "Reaches **N** restaurants in this cohort" + a quiet, scrollable preview of
  the restaurants (id + tier), behind a disclosure if long (progressive disclosure §2).
- **The artifact** — the generated content for this action's `artifact_type`, in a calm
  card: a one-line "what this is" + the body (email/memo/etc.), reviewable. A `[C]`/draft
  cue makes clear it is generated and not yet sent (§4 honest async; the four states:
  generating / ready / error+retry / sent).
- **Footer** — **Send to all N restaurants** (coral, the only primary) · **Experiment ▸**
  (ghost, disabled, "coming soon" — the 1b hook) · **Cancel** (ghost/text).
- Dark `--mxm-*` tokens only; WCAG AA (focus, ≥24px targets, color+icon+text); reduced-motion
  respected. Reuses `Modal`/`Card`/`Button`/`Disclosure` where they fit.

## Data

### New entity — `gov.Action_Dispatch` (cockpit-owned)

| column | type | notes |
|---|---|---|
| `dispatch_id` | uuid PK | |
| `nba_id` | text | FK → `NBA_Proposal` (deferred-style, matching repo convention); **unique** (idempotent) |
| `cohort_id` | text | the dispatched cohort |
| `tenant_id` | text NOT NULL | RLS frontier (server-side) |
| `artifact_type` | enum `public.artifact_type` | reuse the existing enum (email_content/ops_memo/action_plan/finance_impact) — values, not the Support table |
| `content` | jsonb NOT NULL | PRODUCED (generated), never seeded (§14) |
| `target_count` | integer NOT NULL | restaurants reached (computed at send) |
| `status` | enum `{draft, sent}` | conservative; `sent` only after the tx commits |
| `decision_trace_id` | text | FK → `Decision_Trace` (the release's trace; "sin trace no acción") |
| `created_at` | timestamptz default now() | |

- **`action_type → artifact_type` mapping** (which artifact each NBA produces) lives as a
  small server-side table-driven or constant map, grounded in `NBA_Catalogo`
  (`financial_class`/`funnel_stage` already hint the shape). Defined in the plan.

### Generation

- `server/artifact/generateActionArtifact.ts` (new) drafts the content via the shared
  `server/_core/llm.ts` `chatText` helper (the one the recent P06 work standardized).
  **Hermetic under vitest** — deterministic, no live LLM in tests (mirror the embedder /
  classify guards already in the repo; this was the P06 root-cause lesson).

### Contracts (tRPC, `shared/`)

- `cockpit.dispatchDetail(nba_id)` → `{ nba: {action_type,label,cohort_id,path…},
  reach: { count, restaurants: [{id,tier}] }, artifact: { artifact_type, content } }`.
  Pool-scoped server-side; a foreign pool → NOT_FOUND (no leak), same guard as `recordRelease`.
- `cockpit.sendDispatch({ nba_id, resulting_level })` → writes Release_Batch + Decision_Trace
  + Action_Dispatch in one tx; returns `{ dispatchId, traceId }`. Reuses the `recordRelease`
  validation (override-only-down, policy pinned, 4-eyes).

### Release-flow change

- `CockpitRow` / `NbaModal`: the **Release** control becomes "navigate to dispatch" (wouter
  `setLocation('/cockpit/dispatch/'+nba_id)`) instead of firing the inline mutation. **Pause**
  keeps the inline mutation. The cockpit's inline "Released ✓ trace" path is removed for
  release (it now lives on the dispatch screen's success state).

## Done-when (test plan)

- **Unit:** the `action_type → artifact_type` map; the dispatch screen renders reach + draft
  artifact + the four async states; Release navigates (no inline write), Pause still writes
  inline.
- **Integration (rolled-back tx, anti-fake):** `sendDispatch` writes Release_Batch +
  Decision_Trace + Action_Dispatch atomically (trace failure ⇒ nothing persists); a foreign
  pool is rejected (no cross-pool leak); `Action_Dispatch` is unique per nba_id (no double
  dispatch); `dispatchDetail` reach count matches membership; **no `Action_Dispatch.content`
  exists before generation runs** (§14 NULL-pre-run).
- **Hermetic LLM:** generation tests run deterministic under vitest (no live call).
- **Gate:** typecheck · lint · unit · integration · build · axe AA on the new screen.

## Open questions for the plan

- Generate the artifact **at screen load** (cached) vs **on demand** (a "Draft the artifact"
  button)? Lean: on load with a skeleton, regenerate optional.
- The restaurant preview: show all, or top-N with a count? Lean: top-N + "and M more".
- Which `artifact_type` per action for the first build (start with A3 email / A6 memo)?
