import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, tenantProcedure } from "../_core/trpc.js";
import { query } from "../db/pool.js";
import { assertSingleVersion } from "../_core/antimix.js";
import { runP01 } from "../jobs/p01.js";
import type { CohortsRunResult } from "../../shared/contracts.js";

// Read-only projections of P01 results. All tenant-scoped server-side (RLS guard); cohort-zone
// reads honor k-anon (k_suppression_applied) and anti-mix (single cohort_rule_version).
// NULL pre-run passes through as NULL — never a fabricated number (§14).
const DELTA_PANEL_LIMIT = 200;

async function current(): Promise<string> {
  const r = await query<{ value: string }>(
    `select value from catalog."Config_Knobs" where key='cohort_rule_version_current'`,
  );
  if (!r[0]?.value) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "missing cohort_rule_version_current" });
  }
  return r[0].value;
}
async function latestWeek(v: string, tenantId: string): Promise<string | null> {
  const r = await query<{ s: string }>(
    `select s.week::text s
     from cohort."Cohort_Membership_Snapshot" s
     join tenant."Restaurant" r on r.restaurant_id=s.restaurant_id and r.tenant_id=$2
     where s.cohort_rule_version=$1
     order by s.week desc
     limit 1`,
    [v, tenantId],
  );
  return r[0]?.s ?? null;
}

type CohortRow = {
  cohort_id: string;
  cuisine: string | null;
  zone: string | null;
  tier_base: string;
  n_accounts: number | null;
  collapsed: boolean | null;
  k_suppression_applied: boolean | null;
  cohort_rule_version: string;
  descriptive_baseline: unknown;
  opportunity_value: number | null;
  freshness_ts: string | null;
  stale: boolean | null;
};

// Semaphore status (F-2.1): redundant text/icon carrier, never color-only.
function status(c: CohortRow): "pending" | "suppressed" | "collapsed" | "ok" {
  if (c.k_suppression_applied) return "suppressed";
  if (c.n_accounts === null) return "pending";
  if (c.collapsed) return "collapsed";
  return "ok";
}

// Demo windows the in-product trigger computes (deterministic ref date; the 2nd week enables the delta).
const RUN_WEEKS = ["2026-05-25", "2026-06-15"] as const;
const RUN_REF_DATE = "2026-06-17";

export const cohortsRouter = router({
  // 01 operability — the PRODUCT triggers the P01 batch in-product (mirrors diagnosis.run, Gate 1), so a
  // human can drive the Cohorts Explorer with no `pnpm db:p01` terminal. runP01 is deterministic and writes
  // via UPSERT, so a re-run never duplicates (idempotent). Numbers are PRODUCED by the SQL producers over the
  // seeded population, then READ back here — never seeded as results (§14). tenantProcedure = authed.
  run: tenantProcedure.mutation(async (): Promise<CohortsRunResult> => {
    // Prototype: relax k-anon to 1 so the long-tail cuisine×zone×tier cells render instead of suppressing
    // (they fall under production k=5). k_anon_threshold is a NAMED knob (§3.8) so this tunes WITHOUT code;
    // the suppression mechanism stays intact and is still tested at k=5. Mirrors scripts/run-p01.ts.
    await query(`update catalog."Config_Knobs" set value='1' where key='k_anon_threshold'`);
    await runP01({ week: RUN_WEEKS[0], refDate: RUN_REF_DATE });
    await runP01({ week: RUN_WEEKS[1], refDate: RUN_REF_DATE, prevSemana: RUN_WEEKS[0] });
    const v = await current();
    const c = await query<{ n: number }>(
      `select count(*)::int n from cohort."Cohort" where cohort_rule_version=$1 and n_accounts is not null`,
      [v],
    );
    const m = await query<{ n: number }>(
      `select count(*)::int n from cohort."Cohort_Membership_Snapshot" where cohort_rule_version=$1`,
      [v],
    );
    return { weeks: [...RUN_WEEKS], cohorts: c[0]?.n ?? 0, memberships: m[0]?.n ?? 0 };
  }),

  // Demo operability — clear the business base so the operator can load a fresh dataset live.
  // INTENTIONALLY global (ALL tenants/pools): this is the operator's "clear entire database" demo-reset
  // action, a deliberate exception to the per-tenant RLS scoping used everywhere else. Not an oversight.
  // Truncates ONLY business + cohort-result tables; PRESERVES catalog (knobs by name, rule versions,
  // named queries, NBA/intent catalogs) and gov.User — wiping those would break the producers (§3.8).
  // Destructive + demo-scoped: guarded by a confirm dialog client-side; tenantProcedure = authed.
  clearBusinessData: tenantProcedure.mutation(async (): Promise<{ cleared: true }> => {
    await query(`
      truncate
        cohort."Prioritized_NBA_Event", cohort."Cohort_Membership_Snapshot",
        cohort."Subgroup", cohort."Cohort",
        tenant."Weekly_Connection", tenant."Conversation_Episode",
        tenant."Order", tenant."Restaurant"
      restart identity cascade;
    `);
    return { cleared: true };
  }),

  // F-2.1 / F-4.1 — cohort cells + semaphore status.
  list: tenantProcedure.query(async ({ ctx }) => {
    const v = await current();
    const rows = await query<CohortRow>(
      // freshness_ts + stale exposed read-only (BR-12). stale computed server-side via fn_is_stale
      // (reads TTL_baseline_days BY NAME, §3.8) — fail-closed: NULL freshness ⇒ stale.
      `select cohort_id, cuisine, zone, tier_base, n_accounts, collapsed, k_suppression_applied,
              cohort_rule_version, descriptive_baseline, opportunity_value::float8 as opportunity_value,
              freshness_ts::text as freshness_ts, cohort.fn_is_stale(freshness_ts, now()) as stale
       from cohort."Cohort" where cohort_rule_version=$1 order by tier_base, cuisine, zone`,
      [v],
    );
    await assertSingleVersion(ctx.tenantId, rows.map((r) => r.cohort_rule_version));
    return rows.map((c) => ({ ...c, status: status(c) }));
  }),

  // F-1.6 — top-vs-base baseline comparison for one cohort (suppressed ⇒ no data).
  compare: tenantProcedure.input(z.object({ cohort_id: z.string() })).query(async ({ ctx, input }) => {
    const v = await current();
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
    const v = await current();
    const s = await latestWeek(v, ctx.tenantId);
    if (!s) return [];
    const rows = await query(
      // percentile_delta exposed read-only (F-2.4 feature-attribution: why it moved). Additive —
      // does NOT touch the P02 handoff payload (fn_handoff / eventoPriorizadoNba unchanged).
      `select e.evento_id, e.restaurant_id, e.cohort_id, e.week::text as week, e.delta_status,
              e.percentile_in_cohort::float8 as percentile_in_cohort, e.gap_to_top::float8 as gap_to_top,
              e.percentile_delta
       from cohort."Prioritized_NBA_Event" e
       join tenant."Restaurant" r on r.restaurant_id=e.restaurant_id and r.tenant_id=$1
       where e.cohort_rule_version=$2 and e.week=$3
       order by (e.delta_status='at_risk') desc, e.gap_to_top desc nulls last
       limit $4`,
      [ctx.tenantId, v, s, DELTA_PANEL_LIMIT],
    );
    return rows;
  }),

  // F-5.1 — drill into one cohort's accounts, ordered by gap. Tenant-scoped.
  drill: tenantProcedure.input(z.object({ cohort_id: z.string() })).query(async ({ ctx, input }) => {
    const v = await current();
    const s = await latestWeek(v, ctx.tenantId);
    if (!s) return [];
    return query(
      `select p.restaurant_id, p.percentile_in_cohort::float8 as percentile_in_cohort,
              p.gap_to_top::float8 as gap_to_top, p.subgroup_id,
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
    const v = await current();
    const s = await latestWeek(v, ctx.tenantId);
    if (!s) return [];
    return query<{ cohort_id: string; intent: string; n: number }>(
      `select p.cohort_id, ce.intent, count(*)::int n
       from tenant."Conversation_Episode" ce
       join cohort."Cohort_Membership_Snapshot" p
         on p.restaurant_id=ce.restaurant_id and p.week=$2 and p.cohort_rule_version=$3
       join cohort."Cohort" c on c.cohort_id=p.cohort_id and c.cohort_rule_version=p.cohort_rule_version
       where ce.tenant_id=$1 and coalesce(c.k_suppression_applied,true)=false and ce.intent is not null
       group by p.cohort_id, ce.intent order by p.cohort_id, ce.intent`,
      [ctx.tenantId, s, v],
    );
  }),
});
