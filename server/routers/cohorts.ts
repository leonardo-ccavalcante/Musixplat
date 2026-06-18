import { z } from "zod";
import { router, tenantProcedure } from "../_core/trpc.js";
import { query } from "../db/pool.js";
import { assertSingleVersion } from "../_core/antimezcla.js";

// Read-only projections of P01 results. All tenant-scoped server-side (RLS guard); cohort-zone
// reads honor k-anon (k_suppression_applied) and anti-mezcla (single cohort_rule_version).
// NULL pre-run passes through as NULL — never a fabricated number (§14).

async function vigente(): Promise<string> {
  const r = await query<{ value: string }>(
    `select value from catalog."Config_Knobs" where key='cohort_rule_version_current'`,
  );
  return r[0]?.value ?? "v1";
}
async function latestSemana(v: string): Promise<string | null> {
  const r = await query<{ s: string }>(
    `select max(week)::text s from cohort."Cohort_Membership_Snapshot" where cohort_rule_version=$1`,
    [v],
  );
  return r[0]?.s ?? null;
}

type CohortRow = {
  cohort_id: string;
  tenure_bucket: string;
  tier_base: string;
  n_accounts: number | null;
  collapsed: boolean | null;
  k_suppression_applied: boolean | null;
  cohort_rule_version: string;
  descriptive_baseline: unknown;
  opportunity_value: number | null;
};

// Semáforo status (F-2.1): redundant text/icon carrier, never color-only.
function status(c: CohortRow): "pending" | "suppressed" | "collapsed" | "ok" {
  if (c.k_suppression_applied) return "suppressed";
  if (c.n_accounts === null) return "pending";
  if (c.collapsed) return "collapsed";
  return "ok";
}

export const cohortsRouter = router({
  // F-2.1 / F-4.1 — cohort cells + semáforo status.
  list: tenantProcedure.query(async ({ ctx }) => {
    const v = await vigente();
    const rows = await query<CohortRow>(
      `select cohort_id, tenure_bucket, tier_base, n_accounts, collapsed, k_suppression_applied,
              cohort_rule_version, descriptive_baseline, opportunity_value
       from cohort."Cohort" where cohort_rule_version=$1 order by tier_base, tenure_bucket`,
      [v],
    );
    await assertSingleVersion(ctx.tenantId, rows.map((r) => r.cohort_rule_version));
    return rows.map((c) => ({ ...c, status: status(c) }));
  }),

  // F-1.6 — top-vs-base baseline comparison for one cohort (suppressed ⇒ no data).
  compare: tenantProcedure.input(z.object({ cohort_id: z.string() })).query(async ({ ctx, input }) => {
    const v = await vigente();
    const rows = await query<CohortRow>(
      `select cohort_id, k_suppression_applied, descriptive_baseline, cohort_rule_version
       from cohort."Cohort" where cohort_id=$1 and cohort_rule_version=$2`,
      [input.cohort_id, v],
    );
    await assertSingleVersion(ctx.tenantId, rows.map((r) => r.cohort_rule_version));
    const c = rows[0];
    if (!c || c.k_suppression_applied) return { suppressed: true as const, baseline: null };
    return { suppressed: false as const, baseline: c.descriptive_baseline };
  }),

  // F-2.3 / F-2.7 — prioritized deltas (at_risk first), gap exposed. Tenant-scoped via join.
  deltas: tenantProcedure.query(async ({ ctx }) => {
    const v = await vigente();
    const rows = await query(
      `select e.evento_id, e.restaurant_id, e.cohort_id, e.delta_status,
              e.percentile_in_cohort, e.gap_to_top
       from cohort."Prioritized_NBA_Event" e
       join tenant."Restaurant" r on r.restaurant_id=e.restaurant_id and r.tenant_id=$1
       where e.cohort_rule_version=$2
       order by (e.delta_status='at_risk') desc, e.gap_to_top desc nulls last`,
      [ctx.tenantId, v],
    );
    return rows;
  }),

  // F-5.1 — drill into one cohort's accounts, ordered by gap. Tenant-scoped.
  drill: tenantProcedure.input(z.object({ cohort_id: z.string() })).query(async ({ ctx, input }) => {
    const v = await vigente();
    const s = await latestSemana(v);
    if (!s) return [];
    return query(
      `select p.restaurant_id, p.percentile_in_cohort, p.gap_to_top, p.subgroup_id,
              p.n_min_ok, p.mode, p.week::text as week, p.cohort_id
       from cohort."Cohort_Membership_Snapshot" p
       join tenant."Restaurant" r on r.restaurant_id=p.restaurant_id and r.tenant_id=$1
       where p.cohort_id=$2 and p.week=$3 and p.cohort_rule_version=$4
       order by p.gap_to_top desc nulls last`,
      [ctx.tenantId, input.cohort_id, s, v],
    );
  }),

  // F-4.2 — ML changelog timeline (read-only, ordered by effective_date).
  changelog: tenantProcedure.query(async () => {
    return query(
      `select version_id, effective_date::text as effective_date, what_changed, baseline_effect, provenance
       from catalog."Cohort_Rule_Version" order by effective_date`,
    );
  }),

  // F-3.3 / F-3.4 — raw ticket distribution intent × cohort, tenant-scoped, k-anon respected.
  intentCounts: tenantProcedure.query(async ({ ctx }) => {
    const v = await vigente();
    const s = await latestSemana(v);
    if (!s) return [];
    return query<{ cohort_id: string; intent: string; n: number }>(
      `select p.cohort_id, ce.intent, count(*)::int n
       from tenant."Conversation_Episode" ce
       join cohort."Cohort_Membership_Snapshot" p
         on p.restaurant_id=ce.restaurant_id and p.week=$2 and p.cohort_rule_version=$3
       join cohort."Cohort" c on c.cohort_id=p.cohort_id
       where ce.tenant_id=$1 and coalesce(c.k_suppression_applied,true)=false and ce.intent is not null
       group by p.cohort_id, ce.intent order by p.cohort_id, ce.intent`,
      [ctx.tenantId, s, v],
    );
  }),
});
