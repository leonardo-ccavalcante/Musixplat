# 03b:NBA-AGENTE — which-test selection (problem-solving + SAT), Knowledge_Case trace, value-edit modal · [target: AGENTE + design-only CÓDIGO]

> **IMPLEMENTED 2026-06-18 — aligned to the authoritative `breakdown_N8N.md` 02:1A contract (§8).**
> Shipped: the substrate `cohort.fn_nba_test`/`fn_nba_test_all` (mig `20260618170000`), the tRPC `nba.test`/
> `nba.testAll` (tenant-gated), the engine `server/agente/nba_engine.ts` (`proposeNba`) behind the
> `ReasoningProvider` seam (`server/agente/reasoning.ts`, deterministic provider now), and the 02:1B NBA
> autonomy gate `sealMinCalculationNBA` (`server/conversation/min.ts`, reusing `gov.compute_effective_level`).
> **CONTRACT CORRECTION (vs earlier drafts of this doc + slice-3 doc 03):** per `breakdown_N8N.md:63-69`,
> `02:1A` writes **only `NBA_Proposal`** and fires **02:1B** — it does **NOT** write `Knowledge_Case`. The
> `Knowledge_Case` learning loop is the **05B diagnosis flow** (separate, EPIC-B1). The NBA flow's own
> learning is `02:US-1.1.1-d` (ROI-driven `impacto_estimado`, post-action). So the engine has **no KC trace
> and no prior-blend** — ranking is pure relative-gap (deterministic); the LLM provider plugs into the seam
> later for genuine /problem-solving + /sat (the NUMBER stays `fn_nba_test`). `lever_class`/`routing_destination`
> are left NULL (piece `02:BR-13`). Anchors: `03_nba_deterministic_test.md`, `01_nba_issue_tree.md`, CLAUDE.md
> §2/§3.6/§3.7/§8/§14.

> **PART OF — `specs/spec_ready/02_NBA Playbooks best actions screen.md` (Cockpit de Gobernanza de Autonomía).**

## What shipped (the substrate this engine consumes)

`cohort.fn_nba_test(restaurant_id, action_code, week) → cohort.nba_verdict` and
`cohort.fn_nba_test_all(restaurant_id, week) → setof nba_verdict`. Deterministic, side-effect-free, read-only.
Verdict object: `{ action_code, dimension, measured, standard, verdict ∈ {below|ok|above|no_data}, gap,
within_range, n_min_ok, k_anon_ok, provenance:'[V]' }`.

- **Catalog = contract (editable, no redeploy to tune):** the test is a thin router over
  `catalog."NBA_Catalogo"` columns — `root_cause_signal` (reused as the exact membership column),
  `standard_knob`, `verdict_sense`, `signal_scale`, `standard_negate`. Tune A3/thresholds by editing the
  DB (the modal below), not the function.
- **§14 fail-closed:** NULL signal / no row / A8 ⇒ `no_data` (never a fabricated below/ok). Standard read
  BY NAME via `catalog.knob_required_num` (raises if missing). Same brutos ⇒ byte-identical verdict.
- **`action_code` added to the verdict** (vs the original `03_` shape) so `fn_nba_test_all` rows are
  unambiguous — A2/A3 share `dimension='price_pctile_in_cohort'`.
- **k-anon/n_min surfaced, not suppressed in the substrate:** the verdict carries `k_anon_ok`/`n_min_ok`;
  the frontier (suppress / qualitative) is the consumer's job (§3.2) — see the engine contract below.

## Functionality — the AGENTE engine (`02:1A`, step-by-step)

The AI does NOT call a fixed test. It analyzes WHICH function to call, calls the deterministic CÓDIGO test,
then interprets WITHIN range. §8 golden rule: the AGENTE reasons/selects/interprets **text**; the NUMBER is
always `fn_nba_test`, never fabricated.

1. **/problem-solving — structure + rank.** The MECE funnel issue-tree IS the catalog (A1-A8,
   `01_nba_issue_tree.md`). **As built (`deterministicReasoning`):** call `fn_nba_test_all(R, week)` ONCE →
   rank the out-of-range dimensions (`verdict` ∈ below/above) by **relative gap** `|gap|/|standard|` (fair
   across scales — connection 0-1 vs price 0-100), tie → `action_code` asc; take the **top 3** (HARD CAP 3,
   cost discipline). **No `Knowledge_Case` prior / no blend** — KC is the 05B diagnosis flow, not the NBA
   engine (see the contract-correction note above). **LLM provider (later, SAME seam):** does genuine
   /problem-solving structuring and may weigh history — still calling `fn_nba_test` for every number (§8).
2. **Sequential elimination, carry-forward (≤3 rounds).** Test the highest-ranked hypothesis first via
   `fn_nba_test(R, action_code, week)`:
   - verdict CONFIRMS (any `below`/`above` matching the action's `verdict_sense` — no magnitude gate) ⇒ that
     is the lever; proceed.
   - verdict DISCONFIRMS (`ok`) ⇒ record in `discarded_branches`, move to the 2nd, then 3rd. **Never re-test
     a discarded branch.**
   - `no_data` ⇒ cannot test this branch; record + move on.
3. **/sat (CIA Tradecraft) at each branch.** Key Assumptions Check + Analysis of Competing Hypotheses so the
   ranking isn't biased. Canonical trap: "low orders" = *attractiveness* (A2-A4, the restaurant's fault) vs
   *demand/zone* (A5, **not** its fault). ACH uses the deterministic verdicts to keep the cause whose
   competitors are most disconfirmed.
4. **Terminate after ≤3 rounds — never loop.** A hypothesis confirms ⇒ interpret WITHIN `within_range`
   (cannot assert a number `fn_nba_test` didn't return, §3.6) ⇒ propose its action (A1-A7). All 3 disconfirmed
   or `no_data` ⇒ **ESCALATE TO HUMAN** (`outcome='escalated'`, A8 terminal) — never invent a cause, never a
   4th hypothesis (§3.7 fail-closed + the cost budget Leo set).

### k-anon / n_min behavioral contract (where the substrate's flags become a rule)

The substrate computes the verdict and surfaces the flags; the ENGINE enforces the frontier:
- `k_anon_ok=false` ⇒ treat the verdict **qualitatively** — never surface a cell-identifying number across
  the output frontier (§3.2 / BR-12).
- `n_min_ok=false` ⇒ **down-rank cohort-relative hypotheses** (A2/A3 especially: `price_pctile_in_cohort`
  is a within-cohort percentile, statistically hollow when the cell is tiny). The own-data signals
  (A1 connection, A4 quality, A6/A7 cancel) do not carry this fragility.

## Functionality — the learning loop (Knowledge_Case trace ↔ eval) — 05B FLOW, NOT the NBA engine

> ⚠️ **CORRECTION (2026-06-18):** this learning loop is the **05B diagnosis flow**, NOT `02:1A`. The
> as-built NBA engine does **not** write `Knowledge_Case` (the `02:1A` contract is `NBA_Proposal` + fire
> `02:1B`). The mapping below documents how the **05B** diagnosis engine (its own slice) uses KC, and how a
> future NBA→learning bridge *could* shape a trace **if** we deliberately add the cross-flow (its own
> decision). The NBA flow's native learning is `02:US-1.1.1-d` (ROI `impacto_estimado`, post-action).

**TRACE (05B diagnosis engine).** Persist every investigation to `tenant."Knowledge_Case"`
(mig `20260617000014_05b_diagnostico.sql`) — real columns, no invention:

| engine output | Knowledge_Case column | provenance |
|---|---|---|
| ordered path taken (codes tested, in order) | `path_used` (jsonb) | the steps are facts |
| hypotheses ruled out + the disconfirming verdict | `discarded_branches` (jsonb) | MEASURED verdicts ⇒ [V] |
| resolved / not_resolved / escalated | `outcome` | MEASURED ⇒ [V]/[I] |
| how it was solved | `resolution` (resolved ⇒ required) | AI text ⇒ [C] |
| why it didn't close | `not_resolved_reason` (not_resolved/escalated ⇒ required) | AI text ⇒ [C] |
| pending human RLHF | `reviewed` (default false) | human gate |

`outcome` is gated by the two-polarity CHECK (resolved⇒`resolution`; not_resolved/escalated⇒
`not_resolved_reason`). There is **no `polarity` column** — polarity is inferred from `outcome`.

**EVAL = the outcome is MEASURED, the narrative is human-gated.** The "eval" of a reasoning run is its
`outcome` (resolved/not_resolved/escalated) — deterministic, §14 — NOT an AI self-grade. The
post-action ROI eval (did the chosen action move the KPI? holdout/pre-post) is a SEPARATE slice (EPIC-3),
out of scope here.

**IMPROVEMENT LOOP (continuous, after every solution).** Review the saved trace: **prune** dead branches
(`discarded_branches` → don't re-propose next time) and **replicate** resolved paths (`path_used`). This is
the Knowledge_Case convergence (NEGATIVE polarity pruned, POSITIVE replicated) — converges, never oscillates.

### Where Leo reviews / edits the step-by-step

Two surfaces, both versioned/auditable:
1. **The protocol/orchestration artifact** (next session): a TS module with NAMED steps (or an n8n workflow
   with named nodes) + the problem-solving/SAT prompt. Editing this changes HOW it reasons — the ranking
   order, the SAT gates, the 3-cap. This is the "step-by-step" Leo asked to be able to change.
2. **The value-edit modal** (below): editing `Config_Knobs` (the standards) and `NBA_Catalogo` (the contract:
   which signal, sense, scale) re-bases every future verdict — no redeploy.

## Design — the value-edit modal (tRPC config contract, DESIGN-ONLY)

A cockpit modal so Leo tunes the knobs/contract without a deploy. Mirrors the hardened read pattern in
`server/routers/cohorts.ts` (`tenantProcedure`, `current()` version pin, tenant join on
`(restaurant_id, tenant_id)`, `assertSingleVersion`). Zod io lives in `shared/contracts.ts`. NOT built this
session — contract only, so the next session adds `server/routers/nba.ts` (or a `config` router) cleanly.

- `config.listKnobs` — `tenantProcedure.query` → `catalog."Config_Knobs"` (key, value, provenance, owner)
  joined to the `NBA_Catalogo` rows that USE each knob (so the modal shows knob + action(s) gated + sense/
  scale). Zod output schema.
- `config.updateKnob` — `tenantProcedure.mutation`, Zod input `{ key, value }`. Writes
  `Config_Knobs.value`, stamps `provenance='[C]'` + `owner` (RLHF audit: who/when). Fail-closed numeric
  coercion + plausibility range. **Warning surfaced in the UI:** changing a knob re-bases every future
  `fn_nba_test` verdict (determinism is per-brutos AND per-knob).
- `config.updateCatalog` — same framing, edits the `NBA_Catalogo` contract columns (`standard_knob`,
  `verdict_sense`, `signal_scale`, `standard_negate`) — the "catalog = editable contract" lock. Guard the
  `verdict_sense` CHECK + that `root_cause_signal` names a real signal column (the drift guard in
  `fn_nba_test` raises otherwise).
- **Mockup:** a table — one row per `nba_*` knob: `[key] [editable value] [provenance badge] [action(s)
  gated] [sense]`; an "advanced: edit contract" panel for the catalog columns. Redundant text/icon (never
  color-only), focus-trap + Esc + focus-return on the modal (§4 a11y).

## Data

- Reads (the engine): `cohort.fn_nba_test` / `fn_nba_test_all` (substrate); `catalog."NBA_Catalogo"`,
  `catalog."Config_Knobs"`.
- Writes (the engine): `tenant."Knowledge_Case"` (the trace) — and `gov."NBA_Proposal"` for the proposed
  action (per `02:1A`'s existing contract). The substrate writes nothing.
- Writes (the modal): `catalog."Config_Knobs"`, `catalog."NBA_Catalogo"` — human-gated, audited.

## Done-when / open `[I]`

- **Shipped (this session):** `fn_nba_test` + `fn_nba_test_all` + the catalog contract + the seed fixes +
  17 integration tests green + antifake/pgTAP/typecheck/lint green; perf = Index Scan, <3ms/call.
- **Engine decisions (ratified 2026-06-18 with Leo):** ranking = a DETERMINISTIC blend of data-driven gap
  (`fn_nba_test_all`, present) + `Knowledge_Case` priors (history) — `score = nba_rank_weight_gap·gap_norm +
  nba_rank_weight_prior·prior`, gap dominates; `outcome='resolved'` = PRE-action (a hypothesis confirmed + an
  NBA proposed — the post-action KPI move is the separate EPIC-3 ROI eval); CONFIRM = any below/above (no
  magnitude gate); **runtime = TS module** (`server/agente/nba_engine.ts`, named steps
  `rankHypotheses`/`testHypothesis`/`satGate`/`trace`) calling the substrate via a tRPC `nba.test` wrapper.
- **Next sessions:** implement the TS engine (named-step orchestration + the /problem-solving + /sat prompt)
  + tRPC `nba.test` + the value-edit modal + the `min()` autonomy gate `02:1B` (`nivel_efectivo =
  min(nba_request, released_evals, tier_cap)` — `gov."min_calculation"` hardened with `episode_id`/XOR in mig
  `20260618163314`).
- **New knobs to seed when the engine lands:** `nba_rank_weight_gap`, `nba_rank_weight_prior`.
