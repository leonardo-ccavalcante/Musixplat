---
name: Eval Demo Wiring (EPIC-B4 follow-up #1)
description: Wire the EPIC-B4 evaluator into the seed/run path so the hosted cockpit/observatory shows a REAL measured [V] eval cell (the AI under eval = the real motor, fixture fallback) instead of the [I] LOW floor.
targets:
  - server/eval/motorAnswer.ts
  - server/eval/seedGoldenSet.ts
  - server/jobs/p02.ts
---

# Eval Demo Wiring (EPIC-B4 follow-up #1)

> Stacked on `feat/eval-evaluator-b4` (#68). Makes the evaluator VISIBLE on the hosted demo.

Today the hosted cockpit shows the seeded `LOW [I]` floor (`p02.ts`) because no golden set is run. This piece seeds a real golden set for a post-P01 cohort and invokes `runEval` in the run path, so the cockpit/observatory shows a **measured `[V]` verdict** (status green + real κ/n/redteam). **Promotion stays human** — `released_evals` is left NULL by the evaluator; a human promotes via `eval.promote` (so the demo is honest: the AI earned the *evidence*, not the autonomy, until a human signs).

## Decision (operator): real AI + fixture fallback
The AI under eval = the **real motor** (`deterministicReasoning.select(fn_nba_test_all(restaurant, week))` → `action_code`) when the restaurant has funnel data; falls back to a seeded fixture label only when the motor has no data. So the demo never goes empty and shows the real prova where data allows.

## Data model — no new tables
Reuses #68's `gov.Eval_Set` / `Eval_Case` / `Eval_Judge_Label`. The case `scenario` jsonb carries `{restaurant_id, week, ai_label_fallback}` so the real provider can run the motor (or fall back).

## Producers
- `server/eval/motorAnswer.ts` — `motorAnswer(restaurantId, week)` → the motor's `action_code` (reuses `deterministicReasoning` + `fn_nba_test_all`; NO `NBA_Proposal` write, NO LLM). Shared by the provider and the seeder so the gabarito and the answer come from one source.
- `server/eval/runEval.ts` (#68) gains a **`motorEvalProvider`**: per case, `motorAnswer(scenario.restaurant_id, scenario.week)`; if it yields `A8`/no-data ⇒ `scenario.ai_label_fallback`.
- `server/eval/seedGoldenSet.ts` — `seedGoldenSet({week})` idempotent + ATOMIC (INPUT [V]): pick one real (cohort × intent) with ≥ `eval_min_n` members for `week`; author one case per member carrying `{restaurant_id, week, ai_label_fallback}`; set `correct_label` = the motor's answer for ~90% of cases and a **deliberate human override** (guaranteed ≠ the motor's answer) for a deterministic ~10% so the AI genuinely misses them → pass_rate ≈ 0.9, a real green with weight, not 1.0-by-construction. 3 judges **unanimous** on each case ⇒ Fleiss κ = 1.0 (a reliable golden set, robust to the cohort's answer distribution — the override guarantees ≥2 categories so κ is defined, never NULL/below-floor). Writes Eval_Set + all cases + labels in ONE transaction (a mid-loop failure rolls back, never a partial set the idempotency guard would treat as complete).
  - **HONESTY caveat (§14 line + its limit):** the ~90% non-override cases pass by construction (gabarito = motor = the AI's own answer), so the eval's real SIGNAL is the ~10% override subset. This DEMO proves the pipeline produces a real `[V]` verdict — it is not a rigorous accuracy benchmark of the motor.
- `server/jobs/p02.ts` (`runP02`) — after the proposal loop, BEST-EFFORT call `seedGoldenSet` + `runEval(…, motorEvalProvider)` wrapped in try/catch (demo decoration must NEVER abort `runP02`/`apply-hosted` — the cockpit-critical proposals already committed; a failure is `console.warn`-logged and swallowed).

## Invariants — §14 (the line we must not cross)
- **INV-D1 anti-fake holds:** the golden set (Eval_Set/Case/Judge_Label) is INPUT [V]; the **Eval_Cell verdict is still PRODUCED by `runEval`**, never seeded. `pnpm test:antifake` stays green (Eval_Cell empty pre-run; the seeder + runEval run as producers in the run path, not in `seed.sql`).
  `[@test] pnpm test:antifake`
- **INV-D2 promotion stays human:** the run path runs `runEval` (which never raises) — it does NOT call `eval.promote`. A fresh demo shows a green cell with `released_evals` NULL until a human promotes.
  `[@test] tests/integration/eval_demo_wiring.test.ts`
- **INV-D3 the number is the motor's, measured:** swapping the provider doesn't change κ/n (judges/SQL); pass_rate reflects the real motor vs the gabarito.
  `[@test] tests/integration/eval_demo_wiring.test.ts`

## Success criteria
- **SC-D1** After `runP02`, ≥1 `Eval_Cell` has `status=green` + real κ/n/redteam, `provenance.status='[V]'`, `released_evals` NULL (promotable, not promoted).
- **SC-D2** `observatory.evalList` returns that cell as a measured `[V]` pass (not the `[I]` floor).
- **SC-D3** Full gate green + the run is idempotent (re-running `runP02` does not duplicate cases or flip the verdict).

## NOT in this slice
- The promote button + `n_golden_cases` display in the UI (follow-up #2).
- Full red-team trap cases (follow-up #3).
