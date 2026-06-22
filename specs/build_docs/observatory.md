# observatory — Observatory: AI activity & boundary monitor   ·   [target: CÓDIGO]   [build: Claude+Codex-review]

> Read-only awareness screen over what the AI does today: what it acted on alone, what it learned, how far it may go, and the cost — plus the **honest** human levers that already exist (tighten the autonomy cap, approve/reject learning, release/pause). **No new backend logic / no new producer / no result computed here** — only thin tenant-scoped `SELECT`s over tables that already exist, plus reuse of existing action endpoints. Rules live in `CLAUDE.md`. Design rules: `docs/design/DESIGN-STANDARD.md`. Verified against real code 2026-06-22 (9-agent contract verification + 3 adversarial lenses; findings folded in below).

## Functionality

- **Goal:** In one glance the operator sees what the AI is doing on its own, what it has learned, how far it is allowed to go, and what it costs — and can tighten the limit, approve/reject what it learned, or release/pause an action, without the terminal.
- **Composes / cites:** reuses `02:CP` cockpit (`weekSummary`, `autoActions`, `release`, `configTemplate`, `uploadConfig`), `02:C` motor (`escalations`, `controls.get`, `controls.set`), `P07` cost (`cost.summary`); reads `05A` gov (`Eval_Cell`, `Decision_Trace`, `min_calculation`, `Policy_Tier`) and `05B` `Knowledge_Case`.  ·  **04 §:** §3.2 (k-anon vs n_min), §3.4 (tenant single-pool), §3.6 (provenance/[I]/[V]/[C]), §7 (fail-closed, RLS, financial hard-no), §14 (anti-fake / NULL-pre-run), §3.8 (knobs by name).
- **Contract (E2E):** terminal screen — emits **no** downstream event; it is a pure read/observe surface plus already-existing action endpoints. Three NEW read endpoints; zero new producers.

  | endpoint | TRIGGER-IN | DATA-IN (read) | DATA-OUT | TRIGGERS-FIRED |
  |---|---|---|---|---|
  | `eval.list` (NEW, `tenantProcedure.query`) | screen mount | `gov.Eval_Cell` joined `cohort_id → cohort.Cohort_Membership_Snapshot.restaurant_id → tenant.Restaurant.tenant_id = ctx.tenantId` | rows `{cohort_id, intent, version, released_evals, status, n_cohort_x_intent, kappa, redteam_*, provenance_by_field, stale}` — **all RESULT cols passed through as-stored, never computed here** | null (terminal) |
  | `learning.cases` (NEW, `tenantProcedure.query`) | screen mount / filter | `tenant.Knowledge_Case where tenant_id=$1 [and area_type=$2] [and outcome=$3]` | rows `{kb_case_id, area_type, pattern, outcome, resolution, not_resolved_reason, discarded_branches, probability, reviewed, provenance_by_field, created_at}` | null |
  | `governance.traces` (NEW, `tenantProcedure.query`) | screen mount | `gov.Decision_Trace dt JOIN gov.Action_Dispatch ad ON ad.decision_trace_id=dt.trace_id WHERE ad.tenant_id=$1 AND dt.origin='auto'` | rows `{trace_id, action, effective_level_applied, escalation_axis, proposer_id, confirmer_id, independence_guaranteed, gate_result, time_to_signature_sec, rubber_stamp_flag, timestamp}` | null |
  | **reused, unchanged** | — | `cockpit.weekSummary`, `cockpit.autoActions`, `cost.summary`, `motor.escalations`, `motor.controls.get`, `cockpit.configTemplate` (reads) · `cockpit.release`, `cockpit.uploadConfig`, `motor.controls.set` (actions) | as already defined | as already defined |

- **Workflow — step-by-step runtime:**
  1. Operator opens `/observatory` (sync). React mounts `ObservatoryPage`.
  2. Page fires the read queries in parallel via existing tRPC hooks. Each NEW read resolves `tenant_id` **server-side from the signed session** (`ctx.tenantId`), never the client body (§3.4).
     - `eval.list`: **must** join `cohort_id → Cohort_Membership_Snapshot → Restaurant.tenant_id = $1` (Eval_Cell has **no** tenant_id; a flat select leaks cross-pool). Pin `cohort_rule_version_current` like `WEEK_SQL` to avoid cross-version membership over-count.
     - `governance.traces`: anchor on `Action_Dispatch.tenant_id` with `dt.origin='auto'` (Decision_Trace has **no** tenant_id and no uniform join; the auto-dispatch anchor is the only clean tenant owner and exactly matches the "what the AI did alone" governing thought).
     - `learning.cases`: `where tenant_id=$1` (Knowledge_Case has a real `tenant_id`).
  3. Core = **read only**. No number is computed, ranked, or recomputed (§14). Every value rendered is a producer-written field passed through verbatim; result columns that are NULL stay NULL.
  4. Render with provenance gating (see Design): a cell/row is shown as a measured pass **only** when its `provenance_by_field` tag is `[V]`. Today the eval floor is `[I]` → render "inferred floor — not yet measured", never green-pass.
  5. Actions (operator-initiated, guarded):
     - **Tighten the cap** → reuse `cockpit.configTemplate` (download) + `cockpit.uploadConfig` (`managerProcedure`; writes `Policy_Tier.tier_cap` only, allowlist + range + `policy_version` immutability, atomic, stamps `[V]`/operator, resets `measured_result=NULL`). The cap can only *lower* effective autonomy (`effective = least(tier_cap, released_evals, …)` and the eval floor is LOW) — it cannot grant autonomy past what was measured.
     - **Approve/reject learning** → reuse `motor.controls.set` (`{approve_case_id}`, `managerProcedure`).
     - **Release/Pause** → reuse `cockpit.release` (`managerProcedure`-equivalent path; writes append-only `Decision_Trace`). **Confirm-before** (append-only ⇒ no undo).
  6. UI states along every read: loading-skeleton / honest-empty / error+retry / success — NULL result ⇒ explicit "not yet measured", never zero/green-fake (§14 UI face).
- **Constraints (which `CLAUDE.md §3` hard-nos apply):**
  - **§14 (master):** the screen NEVER writes or fabricates a result. The eval **grade is read-only**; the human lever is the **cap** (`Policy_Tier.tier_cap`), an input, not a verdict. No endpoint here may write `Eval_Cell` result columns (`released_evals, status, n_cohort_x_intent, kappa, redteam_*`).
  - **§3.4 RLS single-pool:** every NEW read resolves tenant server-side; cross-pool = no row returned. `eval.list` and `governance.traces` resolve tenant by **join** (their tables carry no `tenant_id`).
  - **§3.2 k-anon ≠ n_min:** this is an **own-tenant internal** screen → apply **neither** k-anon suppression **nor** n_min collapse to any displayed field; full traceability is required (`Eval_Cell.n_cohort_x_intent` is *not* a k-anon trigger here).
  - **§7 financial hard-no:** read-only on money; no balance moves; release/pause never auto-releases money (reuses the existing guarded path).
  - **§3.6 provenance:** no provenance ⇒ no render (reuse `ProvenanceBadge`, which returns null on falsy prov).
- **Done-when:**
  - *Given* a logged-in operator, *when* they open `/observatory`, *then* they see Posture (what the AI did alone + current autonomy level + week token cost), the eval boundary grid, the learning cases + queue, the auto-activity trace, each with honest empty/loading/error/pending states and provenance-gated status.
  - *Given* an `Eval_Cell` row belonging to another tenant's cohort, *when* `eval.list` runs for this tenant, *then* that row is **not** returned (cross-tenant test).
  - *Given* the current `[I]` eval floor, *when* the grid renders, *then* `status='green'` shows as "inferred floor — not yet measured", **not** a measured pass; `kappa`/`n_cohort_x_intent`/`redteam_*` render as "not yet measured", not 0.
  - *Given* the operator edits the cap via template, *when* they upload, *then* only `Policy_Tier.tier_cap` changes (`managerProcedure`, `[V]`/operator, version immutable); `Eval_Cell` result columns stay unchanged.
  - **Check ejecutable:** `pnpm typecheck && pnpm lint && pnpm test && pnpm test:integration` (RLS cross-tenant cases for the 3 new reads, `RLS_TESTS_ENABLED=1`) `&& pnpm test:antifake && pnpm test:e2e` (Observatory render) `&& pnpm test:a11y`.

## Design

- **Screen/component:** new route `/observatory` → `client/src/pages/ObservatoryPage.tsx`. Ref `Design/musixmatch-pro-design-spec.md` + `docs/design/DESIGN-STANDARD.md`. **Awareness screen** (the signal is the hero, actions secondary/guarded, **zero filled-coral at rest** — §1 awareness case, /cohorts precedent).
- **Governing thought:** *"At a glance: what the AI does alone, what it learned, how far it may go — and let me tighten the limit if needed."*
- **Hierarchy (anti-SAP-wall, §1/§10 squint test):** ONE decisive hero + demoted tiers, not six co-equal blocks.
  - **Hero — Posture:** what the AI did alone this week + current autonomy level; a single inline "tokens this week" line with a link to `/cost` (no standalone cost panel — folded to avoid a 6th competing zone). ← `cockpit.weekSummary` + `cockpit.autoActions` + `cost.summary` (all existing, pure SQL).
  - **Tier 2 — Freedom (Evals + Boundary, merged):** read-only eval grid (status / released level / provenance / freshness) **and** the cap/tiers/knobs the operator may tighten. ← `eval.list` (NEW read) + `motor.controls.get` + `cockpit.configTemplate`. Action: **Tighten cap** (download→edit→upload via `cockpit.uploadConfig`) + tier/knob edits (`motor.controls.set`).
  - **Tier 3 — Learning:** cases the AI learned (resolved/escalated) + the queue awaiting human OK; the "why" (pattern, discarded branches) on expand (§3 cite-don't-assert), with `cost_usd` from escalations ("unpriced", never $0). ← `learning.cases` (NEW) + `motor.escalations` + `motor.controls.get.pending_cases`. Action: approve/reject (`motor.controls.set`).
  - **Tier 4 — Activity & trace:** what the AI did alone + the governance gates (proposer/confirmer, independence, time-to-sign, escalation axis). ← `cockpit.autoActions` + `governance.traces` (NEW). Action: release/pause (`cockpit.release`, confirm-before).
- **Tokens:** `--mxm-*` only, dark-only; fluid `clamp()` + logical properties. Status cues are layered surfaces, not shadow soup.
- **States:** every async surface ships loading-skeleton (sized to final row) / honest-empty (distinct message) / error+retry / success. **No fake-green:** producer-result NULL ⇒ "not yet measured"; `status='green'` is a pass **only** if `provenance_by_field.status=='[V]'`.
- **a11y (WCAG 2.1 AA):** status = color + icon + text (grayscale-safe); raw `[I]/[V]/[C]` in `title`/aria only; modals (deep-dives) keep focus-trap + Esc + focus-return + `aria-modal` (reuse `Modal`); guarded actions are quiet ghost/text controls with confirm-before; `aria-live` on async counts; targets ≥24px.
- **Reuse:**
  - Presentational: `ProvenanceBadge`, `FreshnessBadge` (pure; supply `provenance_by_field`/`stale` from the new reads — omitting `stale` shows everything stale by fail-closed design). **ProvenanceBadge maps `[V]`→"measured" — do NOT use that label for the eval grid** (a human cap edit / an `[I]` floor is not "measured"); pass an eval-context label ("inferred floor" / "operator-set cap") or add a variant.
  - Components `AutonomousRegistry`, `EscalatedList`, `AutonomyControls` are **modals** (`open/onClose`) — the at-a-glance content (posture, eval grid, queue, trace summary) renders **inline** on the page (extract bodies); the full controls/registry stay as deep-dive modals opened from the inline summary. Never gate the hero signal behind a button.
  - Routing: add `import`, `<Route path="/observatory" component={ObservatoryPage} />` before the catch-all in `client/src/App.tsx`, and a `<NavLink>`; Tailwind glob already covers `client/src/pages`.

## Data

- **Canonical tables touched (read-only):** `gov.Eval_Cell` (`20260617000015_05a_foundation_gov.sql:62-74`), `gov.Decision_Trace` (`…:127-162`, append-only trigger `:160-162`), `gov.Action_Dispatch` (`20260621000000_p02_action_dispatch.sql:15`, tenant anchor), `gov.Policy_Tier` / `catalog.Config_Knobs` (via existing `controls`/`configUpload`), `tenant.Knowledge_Case` (`20260617000014_05b_diagnostico.sql:73-98`), `cohort.Cohort_Membership_Snapshot` + `tenant.Restaurant` (tenant-resolution join). **Cap write** = `gov.Policy_Tier.tier_cap` via existing `server/cockpit/configUpload.ts` (no new write code).
- **DATA-IN → DATA-OUT producer:** **none** — Observatory has **no producer**. Every result field is read as-stored; `eval.list`/`governance.traces`/`learning.cases` are `SELECT`-only. Eval result columns stay produced solely by the (unbuilt) golden-set evaluator / `provision.ts`+`p02.ts` floor; the screen never writes them (§14).
- **Gates:**
  - `tenant_id` server-side on all three reads. `eval.list`: join `cohort_id→Cohort_Membership_Snapshot→Restaurant.tenant_id=$1` + pin `cohort_rule_version_current` (clone `provision.ts:22-25` + `WEEK_SQL` version pin). `governance.traces`: `Action_Dispatch.tenant_id=$1 AND dt.origin='auto'` (clone `listAutoActions` `cockpit.ts:141`). `learning.cases`: `where tenant_id=$1`.
  - **k-anon / n_min: NOT applied** (own-tenant internal display; full traceability). Pin a test asserting un-suppressed rows for the owning tenant.
  - **version:** `Eval_Cell.version` = **golden-set version** (`gs-1`), part of `UNIQUE(cohort_id,intent,version)` — it is identity, displayed, never edited here. (It is **not** `cohort_rule_version`, which lives on `NBA_Proposal`.)
  - **Cap edit** keeps the existing guards: allowlist + range (`AUTONOMY_LEVELS`), `policy_version` immutability, atomic `withTx`, `[V]`/operator provenance, `measured_result` reset to NULL (`configUpload.ts:60-87`).
- **Config_Perillas by NAME:** none new. Cap/knob edits go through the existing `OPERATOR_KNOBS` allowlist + `motor.controls.set` bounds; freshness uses `fn_is_stale` (TTL knob by name) already wired into `FreshnessBadge`.
- **Phantom check (§4):** creates **NO** table. Pure reads + an existing write path. No `Eval_Cell`/`Decision_Trace` schema change. (Spec-assumed `Knowledge_Case.human_authored` / `verification_status` do **not** exist — use `reviewed boolean` for vetted state.)
- **Determinism:** same DB state ⇒ same rendered rows (read-only). Cross-tenant test: a foreign-pool eval/trace row never returned. Honest-empty: `outcome='not_resolved'` is structurally empty today (motor writes only `resolved`/`escalated`) → render empty, not green.

## Open follow-ups (surfaced, not silently dropped)
- The **golden-set evaluator** (EPIC-B4) that would make `Eval_Cell` verdicts genuinely `[V]`-measured is **not built**; until then evals display as `[I]` floor. The honest human lever is the cap (this screen) — authoring golden-set *input cases* is a larger future deliverable.
- `governance.traces` covers **auto-origin** traces (the AI-acted-alone story). Human governance traces (release/pause by a person) resolve tenant via a different, cross-pool-ambiguous join; surfacing them is a future extension, not v1.
- `managerProcedure` is fail-closed but permissive by seed (`gov.User.role` defaults to `agent_manager_senior`); proving the gate blocks a non-manager needs a seeded non-manager user (demo decision).
