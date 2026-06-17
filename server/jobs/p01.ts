import { withTx } from "../db/pool.js";

export interface P01Options {
  semana: string; // ISO date — the week being computed
  refDate: string; // ISO date — "as of" for tenure (deterministic, never wall-clock)
  prevSemana?: string; // ISO date — previous week, enables the delta diff (F-2.2)
}

// P01 batch (04 §6). Orchestration in TS; every number is computed by a named SQL producer
// (CLAUDE.md §1/§14). Atomic per week. Determinism: same brutos + same (semana, refDate) ⇒
// identical output. Pinned version is read server-side by the producers (anti-mezcla).
export async function runP01(opts: P01Options): Promise<void> {
  const { semana, refDate, prevSemana } = opts;
  await withTx(async (c) => {
    await c.query("select cohort.fn_assign_cohorts($1, $2)", [semana, refDate]); // F-1.1
    await c.query("select cohort.fn_annotate_scope($1)", [semana]); // F-5.5
    await c.query("select cohort.fn_rank_cohort($1)", [semana]); // F-1.2
    await c.query("select cohort.fn_gate_n_min($1)", [semana]); // F-1.3
    await c.query("select cohort.fn_gate_k_anon()"); // F-1.3b
    await c.query("select cohort.fn_baseline_descriptivo($1)", [semana]); // F-1.4
    await c.query("select cohort.fn_baseline_kpi($1)", [semana]); // F-1.8
    await c.query("select cohort.fn_upside()"); // F-1.7
    if (prevSemana) {
      await c.query("select cohort.fn_diff_delta($1, $2)", [semana, prevSemana]); // F-2.2
    }
    await c.query("select cohort.fn_log_movimiento($1)", [semana]); // F-2.6
  });
}
