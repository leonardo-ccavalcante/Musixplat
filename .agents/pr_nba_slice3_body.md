## What

Slice 3 of the NBA / Autonomy Cockpit (spec `02_NBA Playbooks best actions screen.md`, build-doc `03_nba_deterministic_test.md`).

**Shipped (CÓDIGO):** `cohort.fn_nba_test(restaurant, action_code, week)` + `fn_nba_test_all` — deterministic, read-only, side-effect-free measurement the AGENTE (`02:1A`) calls per hypothesis. Verdict `{ action_code, dimension, measured, standard, verdict ∈ below|ok|above|no_data, gap, within_range, n_min_ok, k_anon_ok, provenance:[V] }`. The NUMBER is always SQL, never the AI (§14/§3.6).

**Design-only (next sessions):** `03b_nba_agente_engine.md` — the AGENTE engine step-by-step (problem-solving 3-cap + SAT, carry-forward elimination, escalate-to-human), the `Knowledge_Case` trace↔eval loop, and the value-edit modal tRPC contract.

## How

- **Catalog = contract (editable, no redeploy to tune):** `NBA_Catalogo` += `standard_knob / verdict_sense / signal_scale / standard_negate`; reuse `root_cause_signal` as the exact membership column (fix A1→`m_connection`, A4→`m_quality`). Thin static-CASE router (no dynamic SQL); drift-guard raises on an unmapped signal.
- Standard read **BY NAME** via `knob_required_num` (raises if missing, §3.8). `signal_scale` normalizes `price_pctile_in_cohort` (0–100) vs the 0.75 knob (→ 75). `standard_negate` (A5): a demand drop ≥ knob is the problem.
- **A3** reuses A2's price diagnosis; its `nba_promo_budget_max=0` knob is the MONEY-release gate (BR-2/§3.3), **not** a measurement standard.
- **§14 fail-closed:** NULL signal / no membership row / A8 ⇒ `no_data`, never a fabricated below/ok.
- `k_anon_ok` / `n_min_ok` surfaced (frontier = consumer, §3.2, per the slice-2 convention).

## Evidence

- `test:integration` **80/80** (17 new + full suite, no regression) · `test:antifake` 11/11 · `test:sql` (pgTAP) 60/60 · `typecheck` + `lint` clean (`--max-warnings=0`)
- perf: Index Scan on `cohort_membership_version_week_rest_idx`, `fn_nba_test` ~2ms, `fn_nba_test_all` ~2ms
- fresh-context adversarial review: **0 blocker / 0 should-fix** (3 nits, judgment calls)

## Notes for review

- **1 judgment call to confirm:** §3.2 suppression is delegated to the consumer (the substrate surfaces `k_anon_ok=false`; it does not suppress inside the function). Matches the slice-2 convention; documented + tested (t14).
- `action_code` added to the verdict object (vs the original `03_` shape) so `fn_nba_test_all` rows are unambiguous (A2/A3 share `dimension`).
- `signal_column` not added — reused `root_cause_signal` as the column contract (karpathy-minimal).
- `min()` autonomy gate (`02:1B`) deferred to a follow-up slice.

Files: `supabase/migrations/20260618170000_nba_test.sql`, `supabase/seed.sql`, `tests/integration/nba_test.test.ts`, `specs/build_docs/03b_nba_agente_engine.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
