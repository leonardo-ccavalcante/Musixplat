# 02C — MOTOR-LLM (autonomous hypothesis engine)   ·   [target: CÓDIGO + AGENTE]   [build: Claude + Codex-review]

> The AI proposes its OWN hypothesis (LLM), a deterministic SQL analysis falsifies/confirms it, the AI acts
> WITHIN the human-approved range (non-money) or escalates, and learns (≤3 loops). It is the LLM provider the
> 02:1A seam already anticipated (`server/agente/reasoning.ts`: *"a future LLM provider doing real
> /problem-solving + /sat — plugs into this SAME interface, still calling fn_nba_test for every number"*).
> CP2 (the floor, PR #42) is the substrate; this is the engine that drives it. Rules: `CLAUDE.md`.

## Functionality

- **Goal:** The AI autonomously diagnoses an underperforming cohort, picks an in-range non-money NBA lever it
  reasoned (not a fixed menu), and dispatches it alone — or escalates honestly when it cannot prove an
  in-range action in ≤3 hypotheses — with the token cost of each decision visible.
- **Composes / cites:** reuses `02:1A` proposeNba seam (`NbaReasoning`), `02:CP2` autoDispatch + `sealMinCalculationNBA`
  (auto_releasable gate), `05B` Knowledge_Case (learning store), `P07` recordUsage + v_llm_cost (token cost),
  `05A` Policy_Tier (`allowed_today` = the approved range). **04 §:** §2 (deterministic≠LLM), §3.3 (auto_releasable),
  §3.6, §7 (money hard-no, fail-closed), §14 (anti-fake). **breakdown_N8N:** 02:1A round-trip.
- **The autonomy boundary (load-bearing — NOT determinism):** the AI may act alone when its hypothesis is
  (a) CONFIRMED by SQL (the lever is `below`/`above` with a real gap from `fn_nba_test`), (b) IN-RANGE — the
  `action_type` is in the human-signed `Policy_Tier.allowed_today` whitelist, and (c) `auto_releasable` —
  `LOW ∧ non-money ∧ n_min_ok ∧ k_anon_ok ∧ policy_resolved` (`sealMinCalculationNBA`). The LLM never produces
  a number (§8); every number is SQL (§14). The human edits the boundary (allowed actions + knobs) in the
  Autonomy Controls surface, and the engine obeys it at runtime by name (§3.8).

- **Contract (E2E):**
  - TRIGGER-IN: sync user-action `motor.run({cohortId})` / `motor.runPool()` from the Cockpit "Run Motor"
    button. tenant_id resolved server-side (§3.4), never from the body.
  - DATA-IN: `cohort.fn_nba_test_all(restaurant_id, week)` → `NbaVerdict[]` (SQL numbers); reviewed
    `Knowledge_Case` rows (grounding, `reviewed=true` only); `Policy_Tier.allowed_today` + `tier_cap`;
    Config_Knobs by name.
  - DATA-OUT (every RESULT NULL pre-run §14, named producer only):
    - ACTED → `gov.Decision_Trace{origin='auto', confirmer_id=NULL}` + `Release_Batch` + `Action_Dispatch`
      (producer = `autoDispatch`, reused unchanged) + `Knowledge_Case{outcome='resolved', resolution,
      path_used, reviewed=false}` (producer = `learnFromMotor`).
    - ESCALATED → `Knowledge_Case{outcome='escalated', not_resolved_reason, discarded_branches, reviewed=false}`
      (producer = `learnFromMotor`). NO dispatch, NO money movement.
    - COST → `gov.Llm_Usage_Log{process_type='motor', ref_id=motor_attempt_id}` per LLM iteration (producer =
      `recordUsage`); cost = `v_llm_cost` (SQL, price-by-name).
  - TRIGGERS-FIRED: terminal (the dispatch is the artifact). Escalations are read by a human in the Cockpit.

- **Workflow — per cohort, fan-out per restaurant (reuses runNbaForCohort sampling), each attempt a ≤3 loop:**
  1. `motor.run({cohortId})` (sync) → tenantProcedure resolves `tenant_id`; assert the cohort belongs to it
     (cohort spans pools — presence ≠ ownership, 04 §3.2); select current-version restaurants in the cohort
     scoped `and r.tenant_id = ctx.tenantId` (the CP2 Codex lesson).
  2. For each restaurant, `runMotorAttempt(restaurantId, cohortId, week, tenantId)` mints `motor_attempt_id`:
     - read `verdicts = fn_nba_test_all(restaurantId, week)` (SQL §14) + `grounding` = reviewed Knowledge_Case
       for this area/pattern.
     - **loop k = 1..3** (knob `motor_max_loops`, default 3 — by name §3.8):
       a. `hyp_k = motorReasoning.proposeHypothesis({verdicts, discarded, grounding})` — ONE LLM call:
          returns `{ lever: NbaVerdict|null, rootCause: string, confidence: number|null, reasoning }` (TEXT
          + a [C] confidence marker, NEVER a measured number §8). `recordUsage({process_type:'motor',
          kind:'chat', refId: motor_attempt_id, usage})`.
          - **No-suppose rule (Leo):** `lever=null` (the AI has no confident in-range candidate) ⇒ ESCALATE
            now (`not_resolved_reason='no_confident_hypothesis'`). It must not guess.
       b. `val = validateHypothesis(hyp_k, restaurantId, cohortId, week, tenantId)` — DETERMINISTIC SQL:
          - confirmed = `lever.verdict ∈ {below,above} ∧ lever.gap != null` (the SQL falsifier);
          - inRange = `lever.action_code ∈ Policy_Tier.allowed_today`;
          - `seal = sealMinCalculationNBA({ financialDirect, nMinOk: lever.n_min_ok, kAnonOk: lever.k_anon_ok,
            policyResolved, ... })` → `auto_releasable`.
       c. branch (§7 honest):
          - confirmed ∧ inRange ∧ `auto_releasable` → **ACT**: `proposeNba` writes the NBA_Proposal with the
            LLM provider, then `autoDispatch(nbaId, tenantId, client)` (reused). `learnFromMotor(outcome=
            'resolved')`. **STOP** (terminal success).
          - confirmed ∧ ¬inRange (money / action not whitelisted / gate fails) → **ESCALATE immediately** —
            the data supports it but the human owns it (`not_resolved_reason='out_of_range'`). STOP.
          - ¬confirmed (SQL says the lever is `ok`/`no_data`) → falsified: push `{hyp_k, reason}` to
            `discarded`; the next iteration grounds on it (genuine reflection). continue.
     - after 3 loops with no action → **ESCALATE** (`not_resolved_reason='exhausted_3_loops'`,
       `discarded_branches`=all 3). STOP.
  3. Aggregate: `{ acted: [...], escalated: [...] }` per cohort; the Cockpit invalidates weekSummary /
     autoActions / escalations.
  4. UI states: "Run Motor" `aria-busy`; the Autonomous Registry shows ACTED (origin=auto, confirmer null);
     a new "Escalated to you" list shows ESCALATED rows with the cost per decision; empty/error explicit,
     never green-fake (§14 — money "no signal" stays honest).

- **Constraints:** §2/§8 (LLM never a number — only ranks/selects text + a [C] confidence) · §7 (money hard-no,
  re-checked from DB in autoDispatch; fail-closed: under-specified gate ⇒ no auto) · §3.3 (auto_releasable is
  the guardrail) · §3.4 (tenant server-side; cohort presence ≠ ownership) · §3.8 (knobs by name) · §3.11
  (autoDispatch/sealMinCalculationNBA are invariant-bearing — REUSED unchanged, pinned by their existing tests).

- **Done-when:**
  - Given a cohort with a confirmed in-range non-money gap, When `motor.run`, Then exactly one NBA is
    auto-dispatched (origin=auto, confirmer null, independence=false) and one Knowledge_Case(outcome='resolved')
    is written, and `Llm_Usage_Log` has ≥1 motor row with a non-null cost in `v_llm_cost`.
  - Given a cohort whose only gap is a money lever, When `motor.run`, Then NOTHING is dispatched and a
    Knowledge_Case(outcome='escalated', not_resolved_reason='out_of_range') is written (§7 proven empirically).
  - Given the AI proposes a lever SQL marks `ok`, When validated, Then it is falsified into discarded_branches
    and a different hypothesis is tried (≤3), else escalated as 'exhausted_3_loops'.
  - Given Leo removes an action from `allowed_today`, When `motor.run`, Then the engine no longer auto-acts on
    it (escalates instead) — the boundary is human-editable and obeyed.
  - Given a written case with `reviewed=false`, Then it does NOT ground the next run until approved
    (RL-guard BR-B16); approving it in the controls makes it ground future runs.
  - **Check ejecutable:** `pnpm test` · `pnpm test:antifake` · `pnpm test:integration` (RLS/tenant +
    money-0 + dedup) · `pnpm test:sql` · `pnpm typecheck` · `pnpm lint`.

## Design

- **Screen/component:** extends the existing Cockpit (`client/src/pages/CockpitPage.tsx` +
  `features/cockpit/*`). Two additions: **(1) Escalated-to-you** list (reuses the AutonomousRegistry modal
  pattern) showing each escalated decision — cohort, the AI's discarded hypotheses, the reason, and the token
  cost. **(2) Autonomy Controls** panel — the human edits the boundary: toggle which `action_type`s are in
  `allowed_today` (the motor's allowed set) and edit the bounding knobs by name; plus approve pending
  Knowledge_Cases (`reviewed=false → true`). Ref `Design/musixmatch-pro-design-spec.md`.
- **Tokens:** `--mxm-*` only, dark-only, fluid (`clamp()` + logical properties). No invented colors.
- **States:** loading (`aria-busy` on Run Motor + controls save) / empty ("No escalations — the AI acted within
  range or found no in-range gap" — warm, not "No items") / error explicit. NULL ⇒ conservative empty, never
  zero/green-fake. Cost shows "—" when a price knob is missing (fail-closed), never $0.
- **a11y (WCAG 2.1 AA):** controls toggles have text labels (color not sole carrier); modal focus-trap + Esc +
  focus-return + `aria-modal`; the "AI acted alone" vs "escalated" distinction carries redundant text+icon;
  `aria-live` on the run result.
- **Reuse:** AutonomousRegistry modal, CockpitHero stat-grid, the `trpc` client (maxURLLength already set),
  shadcn primitives. New only: the controls form + the escalations list body (stated reason: no existing
  editor for allowed_today/knobs).

## Data

- **Canonical tables touched** (no new tables — Karpathy, reuse): READ `cohort.fn_nba_test_all`,
  `tenant.Knowledge_Case` (reviewed grounding), `gov.Policy_Tier` (allowed_today, tier_cap), `catalog.Config_Knobs`.
  WRITE `gov.Decision_Trace` (origin='auto', via autoDispatch), `gov.Release_Batch`, `tenant.Action_Dispatch`
  (via autoDispatch), `gov.NBA_Proposal` (via proposeNba), `tenant.Knowledge_Case` (learnFromMotor),
  `gov.Llm_Usage_Log` (recordUsage). CONTROLS WRITE `gov.Policy_Tier.allowed_today`, `catalog.Config_Knobs.value`,
  `tenant.Knowledge_Case.reviewed`.
- **DATA-IN → DATA-OUT:** numbers (verdicts, gap, cost, auto_releasable) all SQL producers; LLM writes only
  text (rootCause, reasoning) + a [C] confidence. Every RESULT NULL pre-run (§14): Knowledge_Case.outcome is
  NULL until learnFromMotor; no motor row seeds a number.
- **Gates:** `tenant_id` server-side; cohort↔tenant ownership asserted (presence ≠ ownership). n_min
  (`n_min_threshold`) and k-anon (`k_anon_threshold`) stay SEPARATE (§3.2), read inside fn_nba_test → carried on
  the verdict. `cohort_rule_version` stamped (reused from proposeNba). Idempotency: autoDispatch's existing
  dedup (per nba_id + per pool/cohort/action_type) — a re-run does not double-dispatch.
- **Config_Perillas by NAME:** `motor_max_loops` (default 3), `motor_min_confidence` (the [C] floor below which
  the AI escalates rather than acts), plus the reused gate knobs (`n_min_threshold`, `k_anon_threshold`, the
  nba_* thresholds). NEVER a literal. `provenance_by_field` + `created_at` written on Knowledge_Case.
- **New TS process_type:** extend `ProcessType` union in `server/_core/usage.ts` with `'motor'` (the
  Llm_Usage_Log.process_type column is text — no migration). `v_llm_cost` already groups by it.
- **Phantom check (§4):** creates NO denylisted table. Run trace + escalation feed + acted feed are all
  views/derived over Knowledge_Case + Decision_Trace + Llm_Usage_Log (joined by `motor_attempt_id` / nba_id).
- **Determinism:** the SQL path (verdicts, gates, cost) is deterministic — same inputs ⇒ same numbers (pinned
  by anti-fake + integration tests). The LLM path is stubbed in tests (`motorReasoning` injected, like the
  existing deterministic stub) so CI stays reproducible; the real LLM is exercised only in a guarded e2e.

## Sibling (follow-on piece — built AFTER this ships, separate PR)

`02D` — **wire the diagnosis LLM into the /diagnosis UI**. Today `runDiagnosis` defaults to
`deterministicReasoning`; the UI callers (`server/routers/diagnosis.ts:168`, `server/routers/intake.ts:35`)
pass no provider → the screen runs the deterministic twin; `llmReasoning` runs ONLY in `scripts/run-05b.ts`
(CLI). Narrating "the AI classifies the tickets" on that screen is overselling. The fix reuses THIS piece's
shared primitive — an LLM reasoning provider wired into a UI path, recording token cost via `recordUsage`
and stamping honest `[C]/[V]` provenance, behind a by-name knob (`diagnosis_use_llm`, §3.8) that fail-closes
to deterministic (the orchestrator already degrades to needs_human on provider failure, orchestrator.ts:180).
Numbers stay SQL (§8/§14): the LLM only does `classifyArea` + `rankPaths` (text); who-is-affected / €-lost stay
in `fn_hunt_silent` / `fn_impact`. Honest demo narrative: *"the AI reads and classifies the tickets and
proposes the root-cause hypothesis; the platform measures the impact deterministically."* Diagnosis stays a
human-handoff (dossier) — NO autonomous action, NO money gate (unlike the NBA motor). Tracked here so the
primitive in this piece is built reusable, not NBA-only.
