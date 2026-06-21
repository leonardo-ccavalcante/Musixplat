import { TRPCError } from "@trpc/server";
import { query } from "../db/pool.js";
import { runMotorAttempt } from "./runMotor.js";
import { type MotorReasoning, stubMotorReasoning } from "./reasoning.js";

// 02C:3c — tenant-scoped fan-out of the ≤3 motor loop. runMotorAttempt is the per-restaurant primitive (it
// owns the autonomy decision via proposeNba + autoDispatch); this ONLY orchestrates: pick the cohort's
// PROBLEM restaurants and run the loop over each, tallying acted/escalated. CRITICAL §3.4: a cohort spans
// pools (04 §3.2), so cohort presence ≠ tenant ownership — EVERY restaurant/cohort query joins
// tenant."Restaurant" and constrains r.tenant_id, and a foreign cohort hits FORBIDDEN. Mirrors
// runNbaForCohort.ts line-for-line for the SQL guards (the bug class a reviewer caught 5× before).
export interface MotorCohortResult { acted: number; escalated: number; attempts: number; }
export interface MotorPoolResult extends MotorCohortResult { cohorts: number; }

const PROBLEM = `(m_connection<0.55 or m_quality<0.55 or price_pctile_in_cohort>78 or cancel_by_restaurant>0.08)`;

export async function runMotorForCohort(
  cohortId: string,
  tenantId: string,
  reasoning: MotorReasoning = stubMotorReasoning,
): Promise<MotorCohortResult> {
  // (1) inPool guard (§3.4): the cohort must have >=1 restaurant in THIS pool, else FORBIDDEN — no
  // cross-pool fan-out. Join Restaurant + constrain tenant_id (presence ≠ ownership).
  const inPool = await query(
    `select 1 from cohort."Cohort_Membership_Snapshot" cms
       join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id and r.tenant_id = $2
      where cms.cohort_id = $1 limit 1`,
    [cohortId, tenantId],
  );
  if (!inPool.length) throw new TRPCError({ code: "FORBIDDEN", message: "cohort not in this pool" });

  // (2) week = the cohort's latest snapshot (PRECONDITION_FAILED if none — run P01 first).
  const wk = await query<{ week: string }>(
    `select max(week)::text as week from cohort."Cohort_Membership_Snapshot" where cohort_id = $1`,
    [cohortId],
  );
  const week = wk[0]?.week;
  if (!week) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "no cohort snapshot (run P01 first)" });

  // (3) the cohort's tier (Policy_Tier is keyed by tier_base) — one row, the cohort exists post-inPool.
  const ct = await query<{ tier_id: string }>(
    `select tier_base::text as tier_id from cohort."Cohort" where cohort_id = $1`,
    [cohortId],
  );
  const tierId = ct[0]?.tier_id;
  if (!tierId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "cohort has no tier" });

  // (4) sample = the PROBLEM-filtered restaurants of THIS pool (join Restaurant + tenant_id, §3.4): a
  // foreign restaurant's signal must never drive an autonomous action for the caller's pool.
  const sample = await query<{ restaurant_id: string }>(
    `select cms.restaurant_id from cohort."Cohort_Membership_Snapshot" cms
       join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id and r.tenant_id = $3
      where cms.cohort_id = $1 and cms.week = $2 and ${PROBLEM}
      order by cms.restaurant_id limit 12`,
    [cohortId, week, tenantId],
  );

  const out: MotorCohortResult = { acted: 0, escalated: 0, attempts: 0 };
  for (const r of sample) {
    const res = await runMotorAttempt(
      { restaurantId: r.restaurant_id, cohortId, week, tenantId, tierId },
      reasoning,
    );
    if (res.outcome === "acted") out.acted++;
    else out.escalated++;
    out.attempts++;
  }
  return out;
}

// 02C:3c — pool-wide fan-out: run the motor for every current-version cohort in this pool that has a problem
// restaurant, aggregating. Per-cohort runMotorForCohort is the tenant-gated primitive; this loops it (each
// call re-asserts pool membership). cohorts = how many actually produced >=1 attempt.
export async function runMotorForPool(
  tenantId: string,
  reasoning: MotorReasoning = stubMotorReasoning,
): Promise<MotorPoolResult> {
  // Current-version cohorts only, deterministically ordered (mirror proposeForPool): never run
  // historical/arbitrary cohorts. Tenant-scoped via the Restaurant join.
  const cohorts = await query<{ cohort_id: string }>(
    `select distinct cms.cohort_id from cohort."Cohort_Membership_Snapshot" cms
       join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id and r.tenant_id = $1
      where ${PROBLEM}
        and cms.cohort_rule_version = (select value from catalog."Config_Knobs" where key='cohort_rule_version_current')
      order by cms.cohort_id limit 8`,
    [tenantId],
  );
  const agg: MotorPoolResult = { acted: 0, escalated: 0, attempts: 0, cohorts: 0 };
  for (const c of cohorts) {
    const r = await runMotorForCohort(c.cohort_id, tenantId, reasoning);
    agg.acted += r.acted;
    agg.escalated += r.escalated;
    agg.attempts += r.attempts;
    if (r.attempts > 0) agg.cohorts++;
  }
  return agg;
}
