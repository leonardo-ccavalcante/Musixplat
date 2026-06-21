import { TRPCError } from "@trpc/server";
import { query, withTx } from "../db/pool.js";
import { proposeNba } from "../agente/nba_engine.js";
import { autoDispatch } from "./autoDispatch.js";

// 02:CP2 — the "Run NBA" action for one cohort: diagnose → propose → and (the AI acting alone) auto-dispatch
// the auto_releasable, NON-money proposals. The autonomy decision is the ENGINE's (proposeNba +
// sealMinCalculationNBA over the real funnel, §14) — never decided here; this only ROUTES on the verdict.
// tenant-gated: the cohort must have >=1 restaurant in this pool (else FORBIDDEN — no cross-pool propose).
export interface ProposeForCohortResult {
  proposed: number; // levered (actionable) proposals = auto_acted + escalated
  auto_acted: number; // the AI dispatched alone (auto_releasable + non-money)
  escalated: number; // left for a human (money / failed gate / could-not-act)
  skipped: number; // no-act contrafactual (A8 — no attributable lever)
}

const PROBLEM = `(m_connection<0.55 or m_quality<0.55 or price_pctile_in_cohort>78 or cancel_by_restaurant>0.08)`;

export async function proposeAndAutoActForCohort(
  cohortId: string,
  tenantId: string,
): Promise<ProposeForCohortResult> {
  const inPool = await query(
    `select 1 from cohort."Cohort_Membership_Snapshot" cms
       join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id and r.tenant_id = $2
      where cms.cohort_id = $1 limit 1`,
    [cohortId, tenantId],
  );
  if (!inPool.length) throw new TRPCError({ code: "FORBIDDEN", message: "cohort not in this pool" });

  const wk = await query<{ week: string }>(
    `select max(week)::text as week from cohort."Cohort_Membership_Snapshot" where cohort_id = $1`,
    [cohortId],
  );
  const week = wk[0]?.week;
  if (!week) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "no cohort snapshot (run P01 first)" });

  const sample = await query<{ restaurant_id: string }>(
    `select restaurant_id from cohort."Cohort_Membership_Snapshot"
      where cohort_id = $1 and week = $2 and ${PROBLEM}
      order by restaurant_id limit 12`,
    [cohortId, week],
  );

  const out: ProposeForCohortResult = { proposed: 0, auto_acted: 0, escalated: 0, skipped: 0 };
  for (const r of sample) {
    // Propose in its own tx so the proposal ALWAYS persists (a later auto-dispatch failure can't erase it).
    const res = await withTx((client) =>
      proposeNba({ restaurantId: r.restaurant_id, cohortId, week }, undefined, client),
    );
    if (!res.levered) {
      out.skipped++;
      continue;
    }
    out.proposed++;
    const m = (
      await query<{ auto_releasable: boolean | null; fc: string | null }>(
        `select m.auto_releasable, p.financial_class::text as fc
           from gov."NBA_Proposal" p
           left join lateral (
             select auto_releasable from gov."min_calculation" where nba_id = p.nba_id::text
             order by computed_at desc limit 1
           ) m on true
          where p.nba_id = $1::uuid`,
        [res.nbaId],
      )
    )[0];
    // Route on the engine's verdict. Auto only for a clean non-money auto_releasable; autoDispatch re-checks
    // §7 (defense-in-depth). A dispatch failure (e.g. no signed policy) is fail-closed ⇒ leave for the human.
    if (m?.auto_releasable === true && m.fc !== "direct") {
      try {
        await withTx((client) => autoDispatch(res.nbaId, tenantId, client));
        out.auto_acted++;
      } catch {
        out.escalated++;
      }
    } else {
      out.escalated++;
    }
  }
  return out;
}

// 02:CP2 — pool-wide "Run NBA": run the engine for every cohort in this pool that has a problem restaurant,
// aggregating the autonomy spectrum. Per-cohort proposeAndAutoActForCohort is the tenant-gated primitive;
// this just loops it (each call re-asserts pool membership). cohorts = how many actually produced a proposal.
export interface ProposeForPoolResult extends ProposeForCohortResult {
  cohorts: number;
}
export async function proposeForPool(tenantId: string): Promise<ProposeForPoolResult> {
  const cohorts = await query<{ cohort_id: string }>(
    `select distinct cms.cohort_id from cohort."Cohort_Membership_Snapshot" cms
       join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id and r.tenant_id = $1
      where ${PROBLEM} limit 8`,
    [tenantId],
  );
  const agg: ProposeForPoolResult = { proposed: 0, auto_acted: 0, escalated: 0, skipped: 0, cohorts: 0 };
  for (const c of cohorts) {
    const r = await proposeAndAutoActForCohort(c.cohort_id, tenantId);
    agg.proposed += r.proposed;
    agg.auto_acted += r.auto_acted;
    agg.escalated += r.escalated;
    agg.skipped += r.skipped;
    if (r.proposed > 0) agg.cohorts++;
  }
  return agg;
}
