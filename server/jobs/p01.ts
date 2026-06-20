import { withTx, query } from "../db/pool.js";

export interface P01Options {
  week: string; // ISO date — the week being computed
  refDate: string; // ISO date — "as of" for tenure (deterministic, never wall-clock)
  prevSemana?: string; // ISO date — previous week, enables the delta diff (F-2.2)
}

export interface RunWindow { week: string; prevWeek: string; refDate: string; }

// Derive the P01 window from the data itself so ANY uploaded base works regardless of its dates
// (root cause: the window was hardcoded). refDate = week = the latest order date ("as of"); prevWeek
// = week − 21d (mirrors the original 21-day gap so the F-2.2 delta still has two snapshots).
// Fail-closed: no orders ⇒ null (caller no-ops, never invents a date).
export async function deriveRunWindow(): Promise<RunWindow | null> {
  const r = await query<{ d: string | null }>(`select max(order_date)::text d from tenant."Order"`);
  const max = r[0]?.d ?? null;
  if (!max) return null;
  const prev = await query<{ d: string }>(`select ($1::date - 21)::text d`, [max]);
  return { week: max, prevWeek: prev[0]!.d, refDate: max };
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
    // fn_rank just UPDATEd membership (set m_orders + subgroup). Re-ANALYZE it so the planner knows
    // m_orders is now populated — else fn_nba_signals' "m_orders is not null" filter is estimated at ~0
    // rows (stale post-assign stats) and the optimizer nested-loops the Order aggregation 5000× (6.1s).
    // Cheap (5000 rows). Same root-cause family as the post-bulk-load ANALYZE above.
    await c.query('analyze cohort."Cohort_Membership_Snapshot"');
    await c.query("select cohort.fn_nba_signals($1)", [week]); // 02:NBA-SIG — funnel signals for node 1A (needs m_* from rank)
    await c.query("select cohort.fn_gate_n_min($1)", [week]); // F-1.3
    await c.query("select cohort.fn_gate_k_anon($1)", [week]); // F-1.3b (per-week membership k_anon_ok)
    await c.query("select cohort.fn_descriptive_baseline($1)", [week]); // F-1.4
    await c.query("select cohort.fn_baseline_kpi($1)", [week]); // F-1.8
    await c.query("select cohort.fn_upside($1)", [week]); // F-1.7 (weighted, per week)
    if (prevSemana) {
      await c.query("select cohort.fn_diff_delta($1, $2)", [week, prevSemana]); // F-2.2
      // fn_diff_delta bulk-upserts current-week events; refresh stats so the read API estimates
      // current-week prioritized deltas correctly instead of assuming a near-empty event table.
      await c.query('analyze cohort."Prioritized_NBA_Event"');
    }
    await c.query("select cohort.fn_log_movement($1)", [week]); // F-2.6
  });
}
