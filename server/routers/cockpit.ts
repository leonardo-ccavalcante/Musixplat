import type pg from "pg";
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { router, tenantProcedure } from "../_core/trpc.js";
import { query, withTx } from "../db/pool.js";
import { type Level } from "../conversation/min.js";
import { cockpitReleaseInput, type NbaCockpitRow } from "../../shared/contracts.js";

const LEVEL_RANK: Record<Level, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

// 02:EPIC-1 / F-1.1 — the Autonomy Cockpit read surface. Lists every NBA_Proposal in the pool with the
// min() effective_level + the auto_releasable verdict (02:BR-5) so the screen shows AUTO (the AI acts
// alone) vs NEEDS-HUMAN — NEVER recomputing the number (it is produced by 02:1B / min_calculation, §14).
// Tenant-scoped server-side: a cohort is in scope iff it has >=1 restaurant in this pool. Cohorts
// aggregate across pools by design (04 §3.2), so a real pool usually has presence; a pool with ZERO
// presence (or an unknown pool) sees nothing here, and finer cross-tenant insight is k-anon-suppressed
// upstream. tenant_id is resolved server-side (anti-spoofing, 04 §7), never from the body.

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

// 02:1C / F-1.2 / BR-1 / BR-9 / BR-LOG-3 — a human releases or pauses a proposal. Override is ONLY DOWN:
// resulting_level <= effective_level (AUT-11). "Sin trace no acción": the Release_Batch + its Decision_Trace
// are written in ONE tx — if the trace fails, the action does not persist. 4-eyes: the proposer (the AI that
// originated the NBA) <> the operator (the human signer), and the human is the independent confirmer
// (independence_guaranteed). policy_version is resolved + pinned (gate-2); no resolved policy ⇒ fail-closed.
// The autonomy NUMBER (effective_level) is read, never recomputed (§14).
export interface ReleaseInput {
  tenantId: string;
  operatorId: string;
  nbaId: string;
  action: "RELEASE" | "PAUSE";
  resultingLevel: Level;
}
export interface ReleaseResult {
  releaseId: string;
  traceId: string;
  effectiveLevel: Level;
  resultingLevel: Level;
}

export async function recordRelease(i: ReleaseInput, client: pg.PoolClient): Promise<ReleaseResult> {
  const prop = (
    await client.query<{ cohort_id: string; tier_base: string; effective_level: Level | null; calc_id: string | null }>(
      `select p.cohort_id, ct.tier_base, m.effective_level::text as effective_level, m.calculation_id::text as calc_id
       from gov."NBA_Proposal" p
       join cohort."Cohort" ct on ct.cohort_id = p.cohort_id
       left join lateral (
         select calculation_id, effective_level from gov."min_calculation"
         where nba_id = p.nba_id::text order by computed_at desc limit 1
       ) m on true
       where p.nba_id = $1::uuid
         and exists (
           select 1 from cohort."Cohort_Membership_Snapshot" cms
           join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id and r.tenant_id = $2
           where cms.cohort_id = p.cohort_id
         )`,
      [i.nbaId, i.tenantId],
    )
  ).rows[0];
  if (!prop) throw new TRPCError({ code: "NOT_FOUND", message: "proposal not in this pool" }); // no cross-pool leak
  if (!prop.effective_level || !prop.calc_id) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "autonomy not computed yet (02:1B must run first)" });
  }
  if (LEVEL_RANK[i.resultingLevel] > LEVEL_RANK[prop.effective_level]) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "override only down (resulting_level <= effective_level)" });
  }
  const pol = (
    await client.query<{ policy_version: string }>(
      `select policy_version from gov."Policy_Tier" where tier_id = $1 order by policy_version desc limit 1`,
      [prop.tier_base],
    )
  ).rows[0];
  if (!pol) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "no resolved policy for tier (fail-closed)" });
  const ai = (
    await client.query<{ user_id: string }>(
      `select user_id from gov."User" where tenant_id = $1 and role = 'ai_agent' order by user_id limit 1`,
      [i.tenantId],
    )
  ).rows[0];
  if (!ai || ai.user_id === i.operatorId) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "no distinct AI proposer for 4-eyes" });
  }

  const releaseId = randomUUID();
  const traceId = randomUUID();
  const traceAction = i.action === "RELEASE" ? "release" : "pause";

  // Release_Batch first (it is the trace's FK target), then the Decision_Trace, then link 1-1 — all inside
  // the caller's tx so a trace failure rolls the whole action back (BR-LOG-3 "sin trace no hay acción").
  await client.query(
    `insert into gov."Release_Batch"(release_id, cohort_id, action, resulting_level, proposer_id, operator_id, policy_version_validated)
     values ($1, $2, $3::public.release_action, $4::public.autonomy_level, $5, $6, $7)`,
    [releaseId, prop.cohort_id, i.action, i.resultingLevel, ai.user_id, i.operatorId, pol.policy_version],
  );
  await client.query(
    `insert into gov."Decision_Trace"(trace_id, release_id, calculation_id, action, proposer_id, confirmer_id,
        effective_level_applied, policy_version, origin)
     values ($1, $2, $3::uuid, $4::public.trace_action, $5, $6, $7::public.autonomy_level, $8, 'desktop'::public.trace_origin)`,
    [traceId, releaseId, prop.calc_id, traceAction, ai.user_id, i.operatorId, i.resultingLevel, pol.policy_version],
  );
  await client.query(`update gov."Release_Batch" set decision_trace_id = $1 where release_id = $2`, [traceId, releaseId]);

  return { releaseId, traceId, effectiveLevel: prop.effective_level, resultingLevel: i.resultingLevel };
}

export const cockpitRouter = router({
  // 02:F-1.1 — the bandeja: every proposal in the pool with its autonomy verdict, AUTO-first.
  list: tenantProcedure.query(({ ctx }) => listCockpitRows(ctx.tenantId, query)),

  // 02:1C / F-1.2 — human release/pause; writes Decision_Trace + Release_Batch atomically (no-trace-no-action).
  release: tenantProcedure.input(cockpitReleaseInput).mutation(({ ctx, input }) =>
    withTx((client) =>
      recordRelease(
        {
          tenantId: ctx.tenantId,
          operatorId: ctx.userId,
          nbaId: input.nba_id,
          action: input.action,
          resultingLevel: input.resulting_level,
        },
        client,
      ),
    ),
  ),
});
