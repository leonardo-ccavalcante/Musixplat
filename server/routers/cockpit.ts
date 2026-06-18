import type pg from "pg";
import { TRPCError } from "@trpc/server";
import { router, tenantProcedure } from "../_core/trpc.js";
import { query } from "../db/pool.js";
import { type NbaCockpitRow } from "../../shared/contracts.js";

// 02:EPIC-1 / F-1.1 — the Autonomy Cockpit read surface. Lists every NBA_Proposal in the pool with the
// min() effective_level + the auto_releasable verdict (02:BR-5) so the screen shows AUTO (the AI acts
// alone) vs NEEDS-HUMAN — NEVER recomputing the number (it is produced by 02:1B / min_calculation, §14).
// Tenant-scoped server-side: a cohort belongs to the pool iff it has a membership row for a restaurant
// in this tenant (04 §7 RLS single-pool); cross-pool proposals are simply invisible, never leaked.

export type Exec = <T extends pg.QueryResultRow>(sql: string, params: readonly unknown[]) => Promise<T[]>;

type RawRow = {
  nba_id: string;
  cohort_id: string;
  action_type: string | null;
  root_cause: string | null;
  financial_class: "direct" | "indirect" | "none" | null;
  effective_level: "LOW" | "MEDIUM" | "HIGH" | null;
  auto_releasable: boolean | null;
  before_after_expected: unknown;
  cohort_rule_version: string;
};

// Pure display mapping (DB-free, unit-testable). status mirrors auto_releasable; reason explains the human
// route — money hard-no first (BR-2), then a non-LOW level (escalate), then the sample/policy/k-anon gates.
// auto_releasable null/false ⇒ needs_human (fail-closed §3.7).
export function cockpitStatus(
  r: Pick<RawRow, "auto_releasable" | "financial_class" | "effective_level">,
): { status: "auto" | "needs_human"; reason: "money" | "level" | "gates" | null } {
  if (r.auto_releasable === true) return { status: "auto", reason: null };
  if (r.financial_class === "direct") return { status: "needs_human", reason: "money" };
  if (r.effective_level && r.effective_level !== "LOW") return { status: "needs_human", reason: "level" };
  return { status: "needs_human", reason: "gates" };
}

function toRow(r: RawRow): NbaCockpitRow {
  return { ...r, ...cockpitStatus(r) };
}

// AUTO rows first within each cohort (the cockpit surfaces what the AI already cleared, then the queue).
const SQL = `
  select p.nba_id::text as nba_id, p.cohort_id, p.action_type, p.root_cause,
         p.financial_class::text as financial_class, m.effective_level::text as effective_level,
         m.auto_releasable, p.before_after_expected, p.cohort_rule_version
  from gov."NBA_Proposal" p
  left join lateral (
    select effective_level, auto_releasable
    from gov."min_calculation" where nba_id = p.nba_id::text
    order by computed_at desc limit 1
  ) m on true
  where p.cohort_rule_version = $1
    and exists (
      select 1 from cohort."Cohort_Membership_Snapshot" cms
      join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id and r.tenant_id = $2
      where cms.cohort_id = p.cohort_id and cms.cohort_rule_version = $1
    )
  order by p.cohort_id, m.auto_releasable desc nulls last, p.nba_id`;

export async function listCockpitRows(tenantId: string, exec: Exec): Promise<NbaCockpitRow[]> {
  const vr = await exec<{ value: string }>(
    `select value from catalog."Config_Knobs" where key='cohort_rule_version_current'`,
    [],
  );
  const v = vr[0]?.value;
  if (!v) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "missing cohort_rule_version_current" });
  const raw = await exec<RawRow>(SQL, [v, tenantId]);
  return raw.map(toRow);
}

export const cockpitRouter = router({
  // 02:F-1.1 — the bandeja: every proposal in the pool with its autonomy verdict, AUTO-first.
  list: tenantProcedure.query(({ ctx }) => listCockpitRows(ctx.tenantId, query)),
});
