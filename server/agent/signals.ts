import type pg from "pg";

// "Find the real problem" scan: ask the engine (deterministic SQL) which problem types actually have
// signal for ONE restaurant, so the agent picks among real signals instead of guessing a type blind.

type Exec = <T extends pg.QueryResultRow>(sql: string, params: readonly unknown[]) => Promise<T[]>;

export interface Signal {
  problem_type: string;
  direction: string; // 'below' | 'above'
}

export async function scanSignals(exec: Exec, restaurantId: string): Promise<Signal[]> {
  // The 3 cohort-gated signals need the restaurant's latest snapshot week; the 2 raw checks ignore it.
  // No snapshot (restaurant not cohorted yet) ⇒ current_date ⇒ the NBA part yields no_data (filtered out),
  // the raw payment/adoption checks still run. Fail-open to "no signal", never a crash.
  // Pin the CURRENT cohort_rule_version (§3.5 anti-mezcla): fn_nba_test reads membership for that same
  // version, so an older-version week would make every NBA signal return no_data and hide real problems.
  const w = await exec<{ week: string | null }>(
    `select max(week)::text as week from cohort."Cohort_Membership_Snapshot"
       where restaurant_id = $1 and cohort_rule_version = catalog.knob_text('cohort_rule_version_current')`,
    [restaurantId],
  );
  const week = w[0]?.week ?? null;
  return exec<Signal>(
    `select problem_type, direction from cohort.fn_restaurant_signals($1, coalesce($2::date, current_date))`,
    [restaurantId, week],
  );
}

/** THIS restaurant's own at-risk € for the chosen type (payment/cancellation), 0 for non-money types.
 *  Owner-honest: NOT the pool-wide revenue_lost (which is far too high for one restaurant). */
export async function restaurantAtRisk(exec: Exec, restaurantId: string, problemType: string): Promise<number> {
  const r = await exec<{ at_risk: string }>(
    `select tenant.fn_restaurant_at_risk($1, $2)::text as at_risk`,
    [restaurantId, problemType],
  );
  return Number(r[0]?.at_risk ?? 0);
}
