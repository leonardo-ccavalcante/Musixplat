---
name: Eval Evaluator (EPIC-B4)
description: The golden-set evaluator that PRODUCES gov.Eval_Cell verdicts (κ + red-team), auto-downgrades autonomy on fail, and keeps promotion human-gated. Replaces the seeded LOW floor with a measured [V] verdict.
targets:
  - supabase/migrations/20260626120000_eval_evaluator_b4.sql
  - server/eval/runEval.ts
  - server/routers/eval.ts
  - supabase/seed.sql
---

# Eval Evaluator (EPIC-B4)

Produce the measured `gov.Eval_Cell` verdict per (cohort × intent × version) by running a versioned golden set against the AI's own decisions — replacing the seeded `LOW` floor (`[I]`, `server/jobs/p02.ts`) with a real `[V]` verdict. **Downgrade autonomy automatically on failure; promotion (raising `released_evals`) stays a human action backed by this evidence** (`specs/00_vision_completa.md:148` — promote = human + evidence, downgrade = automatic).

## Data model — INPUT (seedable, `[V]`)
- A golden-set CASES table `gov.Eval_Case(eval_case_id, cohort_id, intent, version, scenario jsonb, correct_label text)` — `correct_label` = the right call (an NBA `action_code` A1–A8) for that scenario, human-authored `[V]`.
  `[@test] supabase/tests/eval_evaluator_test.sql`
- Per-case judge labels `gov.Eval_Judge_Label(eval_case_id, judge_id, label)` — ≥2 judges/case, for κ. Seedable `[V]`.
- An eval-set registry `gov.Eval_Set(version, target_level)` — the autonomy level this golden set certifies (e.g. `gs-medium → MEDIUM`).

## Producer — DETERMINISTIC (the §2/§14 core)
`server/eval/runEval.ts` `runEval(cohortId, intent, version, tenantId)` (TS orchestrator + SQL `Named_Query`):
1. For each case: run the **AI under eval** (the NBA reasoning provider) → its `label`. *(The LLM is the EVALUATED, never the grader; tests inject a deterministic provider — hermetic.)*
2. **Grade (SQL):** `label == correct_label` → `pass_rate`, `n`. Deterministic.
3. **κ (SQL):** Fleiss/Cohen kappa over `Eval_Judge_Label` (judge agreement). Never an LLM number.
4. **Red-team (SQL):** `redteam_independence_flag` (judges independent of the AI) + `redteam_judge_vs_human_result`.
5. **Status (SQL rule):** `green` iff `pass_rate ≥ knob(eval_pass_threshold) ∧ n ≥ knob(eval_min_n) ∧ kappa ≥ knob(eval_kappa_min) ∧ redteam_independence_flag`; else `red`.
6. **Write `Eval_Cell` verdict cols `[V]`** (status/kappa/n/redteam_*), provenance per field.
7. **Auto-DOWNGRADE:** on `red` → lower `released_evals` to floor (`LOW`). On `green` → **do NOT raise** (`released_evals` unchanged — promotion is human).

Knobs by name (§3.8, added to `catalog.Config_Knobs`): `eval_pass_threshold`, `eval_min_n`, `eval_kappa_min`.

## Promotion — HUMAN + evidence
`server/routers/eval.ts` `eval.promote` (managerProcedure, `[V]` + signature): raises `Eval_Cell.released_evals` to `Eval_Set.target_level` ONLY when `status='green'` (evidence-gated). Downgrade needs no human; promotion always does.

## Invariants — §14 (write the test FIRST)
- **INV-1 anti-fake:** `Eval_Cell` verdict cols are NULL/floor pre-run; set only by `runEval`/`eval.promote`; never seeded `[V]`.
  `[@test] pnpm test:antifake`
- **INV-2 deterministic:** swapping the LLM provider for the deterministic stand-in yields the SAME verdict for the same labels (the number is SQL, not the model's).
  `[@test] tests/eval/runEval.test.ts`
- **INV-3 promote=human / downgrade=auto:** `runEval` NEVER raises `released_evals`; only `eval.promote` does, and only when `status='green'`.
  `[@test] tests/eval/promote.test.ts`
- **INV-4 wire:** after a green verdict + human promote to MEDIUM, `effective_level = least(...)` for an action in that cell computes MEDIUM (if cap allows).
  `[@test] supabase/tests/eval_evaluator_test.sql`

## Success criteria
- **SC-001** A golden set the AI PASSES → `status=green` + real κ/n + a `target_level` available to promote; passing alone does NOT raise autonomy.
- **SC-002** A golden set the AI FAILS → `status=red` + auto-downgrade `released_evals` to LOW.
- **SC-003** Full CI gate green (typecheck · lint · test · test:antifake · test:sql · integration) + Codex adversarial review (risk-max §14).

## Clarifications / decisions
- κ form: **Fleiss' kappa**, **3 judges/case** (locked by operator). `[decision]`
- κ + red-team are computed **per cell** (cohort × intent × version), the same grain as `pass_rate` — `fn_fleiss_kappa(p_cohort_id, p_intent, p_version)` — so a version shared across cohorts never bleeds one cell's agreement into another. `[decision]`
- AI under eval = the NBA reasoning provider (`proposeNba`/motor reasoning) producing an `action_code`. Tests inject a deterministic hermetic provider (`scenario.ai_label`). `[decision]`
- `target_level` lives on `gov.Eval_Set(version)`, not on each case. `[decision]`
- The eval's own sample size is a NEW column `gov.Eval_Cell.n_golden_cases` — DISTINCT from the pre-existing `n_cohort_x_intent` (raw-ticket volume, a different producer). `[decision]`
- Red-team scope = **weak now / full later**: today `redteam_independence_flag` checks each judge is a non-AI principal (`judge_id not like 'U-AI%'`); the full version (adversarial trap cases the judges must also pass) is a follow-up. `[decision]`
- Two tRPC endpoints in `server/routers/eval.ts` (both `managerProcedure`): `eval.run` (trigger the evaluator for a cell) + `eval.promote` (human-gated raise). The signer is `ctx.userId` (authenticated senior manager, spoof-proof). `[decision]`
- Threshold knobs are seeded in `supabase/seed.sql` (the path `resetDb` re-runs) AND mirrored in the migration; both `on conflict do nothing`. `[decision]`
- EPIC-B4 name collision noted: this is the **Eval_Cell** golden-set evaluator, NOT the `Knowledge_Case.outcome` outcome-measurement producer (`REMAINING_WORK.md:140`). `[decision]`

## NOT in this slice (explicit follow-ups)
- **Hosted-demo wiring:** seeding a real golden set for a post-P01 cohort + invoking `runEval` in the deploy/seed path so the hosted cockpit shows a measured `[V]` cell (today it still shows the `[I]` LOW floor from `p02.ts`). The mechanism + endpoints exist; only the demo invocation is unwired.
- **Observatory display** of `n_golden_cases` and the promote button in the cockpit UI.
- **Full red-team** (adversarial trap cases).
