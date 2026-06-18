import { withTx } from "../db/pool.js";

export interface P01Options {
  week: string; // ISO date — the week being computed
  refDate: string; // ISO date — "as of" for tenure (deterministic, never wall-clock)
  prevSemana?: string; // ISO date — previous week, enables the delta diff (F-2.2)
}

// P01 batch (04 §6). Orchestration in TS; every number is computed by a named SQL producer
// (CLAUDE.md §1/§14). Atomic per week. Determinism: same raw + same (week, refDate) ⇒
// identical output. Pinned version is read server-side by the producers (anti-mix).
export async function runP01(opts: P01Options): Promise<void> {
  const { week, refDate, prevSemana } = opts;
  await withTx(async (c) => {
    await c.query("select cohort.fn_assign_cohorts($1, $2)", [week, refDate]); // F-1.1
    await c.query("select cohort.fn_annotate_scope($1)", [week]); // F-5.5
    // Refresh planner statistics before the heavy producers. The brutos are bulk-loaded (~107k orders)
    // and fn_assign just bulk-inserted ~5000 memberships — all with zero stats on a fresh db. Without
    // this, the cold optimizer nested-loops the Order table per membership in fn_rank_cohort (measured
    // 287s vs 0.2s). Cheap (~hundreds of ms) and runs once per weekly batch. This is what makes the
    // batch resilient to a fresh load (CI, the demo generator, a first deploy) — not a config knob.
    await c.query("analyze");
    await c.query("select cohort.fn_rank_cohort($1)", [week]); // F-1.2
    await c.query("select cohort.fn_nba_signals($1)", [week]); // 02:NBA-SIG — funnel signals for node 1A (needs m_* from rank)
    await c.query("select cohort.fn_gate_n_min($1)", [week]); // F-1.3
    await c.query("select cohort.fn_gate_k_anon($1)", [week]); // F-1.3b (per-week membership k_anon_ok)
    await c.query("select cohort.fn_descriptive_baseline($1)", [week]); // F-1.4
    await c.query("select cohort.fn_baseline_kpi($1)", [week]); // F-1.8
    await c.query("select cohort.fn_upside($1)", [week]); // F-1.7 (weighted, per week)
    if (prevSemana) {
      await c.query("select cohort.fn_diff_delta($1, $2)", [week, prevSemana]); // F-2.2
    }
    await c.query("select cohort.fn_log_movement($1)", [week]); // F-2.6
  });
}
