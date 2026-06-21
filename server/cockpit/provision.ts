import { query } from "../db/pool.js";
import { deriveRunWindow, runP01 } from "../jobs/p01.js";
import { bootstrapPolicies } from "../jobs/p02.js";
import { proposeForPool, type ProposeForPoolResult } from "./runNbaForCohort.js";

export interface ProvisionResult extends ProposeForPoolResult {
  needsBase: boolean; // no orders at all ⇒ the operator must upload/generate a base first (fail-closed)
  ranCohorts: boolean; // P01 was run here because this pool had no cohorts yet
}

// One conservative ([I]) LOW/green Eval_Cell per (cohort, first intent) for THIS pool's current-version
// cohorts — the 2nd min() arm, so the cockpit has data to show. released_evals/status are RESULT columns
// (§14): provenance is stamped [I] so nothing downstream can read them as a measured [V] pass; the LOW
// floor only CAPS least() to LOW (never a permissive grant). Mirrors scripts/run-p02. Idempotent.
async function seedEvalFloor(tenantId: string, version: string): Promise<void> {
  await query(
    `insert into gov."Eval_Cell"(cohort_id, intent, version, released_evals, status, provenance_by_field)
     select distinct cms.cohort_id, ci.intent_id, 'gs-1',
            'LOW'::public.autonomy_level, 'green'::public.eval_status,
            jsonb_build_object('released_evals','[I]','status','[I]')
       from cohort."Cohort_Membership_Snapshot" cms
       join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id and r.tenant_id = $2
       cross join lateral (select intent_id from catalog."Intent_Catalog" order by intent_id limit 1) ci
      where cms.cohort_rule_version = $1
     on conflict (cohort_id, intent, version) do nothing`,
    [version, tenantId],
  );
}

// 02:CP — "Preparar cockpit": the one in-app action that takes an empty pool to a WORKING cockpit, so the
// operator never needs the `db:p02` terminal (before, the producer chain ran only via scripts/apply-hosted).
// Tenant-scoped, idempotent, production-honest (no knob mutation). Steps:
//   (1) ensure cohorts (P01) — only if this pool has none at the current version (reuses runP01, never edits it);
//   (2) bootstrap the governance floor (Policy_Tier defaults — on-conflict, never clobbers an uploaded policy);
//   (3) seed the conservative Eval_Cell floor for this pool's cohorts ([I], LOW, §14);
//   (4) propose + auto-act across the pool (the existing tenant-scoped engine — every number from SQL, §14).
// Numbers are PRODUCED by the engine and READ back — nothing here is seeded as a result (§14).
export async function provisionCockpit(tenantId: string): Promise<ProvisionResult> {
  const version = (
    await query<{ value: string }>(`select value from catalog."Config_Knobs" where key='cohort_rule_version_current'`)
  )[0]?.value;
  if (!version) throw new Error("provisionCockpit: missing cohort_rule_version_current"); // fail-closed (§3.8)

  // (1) cohorts present for THIS pool at the current version? (cohort presence is pool-scoped, §3.4)
  const has = await query(
    `select 1 from cohort."Cohort_Membership_Snapshot" cms
       join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id and r.tenant_id = $2
      where cms.cohort_rule_version = $1 limit 1`,
    [version, tenantId],
  );
  let ranCohorts = false;
  if (!has.length) {
    const w = await deriveRunWindow(); // derive from the data so ANY uploaded/generated base cohortizes
    if (!w) {
      // No orders at all ⇒ honest fail-closed: the operator must load a base first (§14, never invent data).
      return { needsBase: true, ranCohorts: false, cohorts: 0, proposed: 0, auto_acted: 0, escalated: 0, skipped: 0 };
    }
    await runP01({ week: w.prevWeek, refDate: w.refDate });
    await runP01({ week: w.week, refDate: w.refDate, prevSemana: w.prevWeek });
    ranCohorts = true;
  }

  await bootstrapPolicies(); // (2) global tiers (Policy_Tier is tier-keyed) — idempotent on policy_id
  await seedEvalFloor(tenantId, version); // (3) conservative [I] LOW floor for this pool's cohorts
  const r = await proposeForPool(tenantId); // (4) tenant-scoped propose + auto-act
  return { needsBase: false, ranCohorts, ...r };
}
