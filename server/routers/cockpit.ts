import type pg from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, tenantProcedure } from "../_core/trpc.js";
import { query, withTx } from "../db/pool.js";
import { type Level } from "../conversation/min.js";
import {
  cockpitReleaseInput,
  cockpitSendDispatchInput,
  cockpitProposeInput,
  type NbaCockpitRow,
  type AutoActionRow,
} from "../../shared/contracts.js";
import { renderArtifact, buildCopyInput } from "../cockpit/renderArtifact.js";
import { restaurantCopy } from "../cockpit/copywriter.js";
import { proposeAndAutoActForCohort, proposeForPool } from "../cockpit/runNbaForCohort.js";

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

// 02:F-1.2 / 02:CP2 — the "your week" proof strip: HUMAN release/pause decisions (origin <> 'auto') in the
// last 7 days PLUS auto_acted = the actions the AI handled ALONE (origin='auto'). Scoped to this pool (same
// cohort→pool presence rule as the list). A READ of gov."Release_Batch" ⋈ Decision_Trace, never fabricated
// (§14). The trace ORIGIN is what separates a human decision from an autonomous one — a release counted as
// "you released" must be a human's (a left join + `is distinct from 'auto'` keeps a null-origin row human).
// counts cast ::int so node-pg returns numbers, not bigint strings.
const WEEK_SQL = `
  select
    count(*) filter (where rb.action = 'RELEASE' and dt.origin is distinct from 'auto'::public.trace_origin)::int as released,
    count(*) filter (where rb.action = 'PAUSE'   and dt.origin is distinct from 'auto'::public.trace_origin)::int as paused,
    count(*) filter (where rb.action = 'RELEASE' and dt.origin = 'auto'::public.trace_origin)::int as auto_acted
  from gov."Release_Batch" rb
  left join gov."Decision_Trace" dt on dt.trace_id = rb.decision_trace_id
  where rb.created_at >= now() - interval '7 days'
    and exists (
      select 1 from cohort."Cohort_Membership_Snapshot" cms
      join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id and r.tenant_id = $1
      where cms.cohort_id = rb.cohort_id
        -- same current-version pool-presence rule as the list (anti-mezcla §3.5 consistency)
        and cms.cohort_rule_version = (select value from catalog."Config_Knobs" where key='cohort_rule_version_current')
    )`;

export async function weekSummary(
  tenantId: string,
  exec: Exec,
): Promise<{ released: number; paused: number; auto_acted: number }> {
  const r = await exec<{ released: number; paused: number; auto_acted: number }>(WEEK_SQL, [tenantId]);
  return { released: r[0]?.released ?? 0, paused: r[0]?.paused ?? 0, auto_acted: r[0]?.auto_acted ?? 0 };
}

// 02:CP2 — the autonomous-actions registry: what the AI did ALONE (origin='auto'), pool-scoped, recent
// first. Reads each dispatch's rendered title + reach + the applied autonomy level ([V], §14) — never a
// fabricated number. The decision_trace_id ⋈ origin='auto' is what proves the AI, not a human, acted.
const AUTO_ACTIONS_SQL = `
  select ad.dispatch_id::text as dispatch_id, ad.nba_id, ad.cohort_id, p.action_type,
         ad.content->>'title' as title, ad.target_count,
         m.effective_level::text as effective_level, ad.created_at
    from gov."Action_Dispatch" ad
    join gov."Decision_Trace" dt on dt.trace_id = ad.decision_trace_id and dt.origin = 'auto'::public.trace_origin
    left join gov."NBA_Proposal" p on p.nba_id::text = ad.nba_id
    left join lateral (
      select effective_level from gov."min_calculation" where nba_id = ad.nba_id order by computed_at desc limit 1
    ) m on true
   where ad.tenant_id = $1
   order by ad.created_at desc limit 50`;

export async function listAutoActions(tenantId: string, exec: Exec): Promise<AutoActionRow[]> {
  return exec<AutoActionRow>(AUTO_ACTIONS_SQL, [tenantId]);
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

// 02:1a — the dispatch screen read: the released NBA + its reach (cohort restaurants in this pool) + the
// deterministically-rendered artifact. Pool-scoped (foreign pool ⇒ null, no leak). §14: content is rendered
// from PRODUCED fields, never seeded.
export async function dispatchDetail(nbaId: string, tenantId: string, exec: Exec) {
  const p = (
    await exec<{
      nba_id: string;
      action_type: string | null;
      cohort_id: string;
      root_cause: string | null;
      before_after_expected: unknown;
      effective_level: "LOW" | "MEDIUM" | "HIGH" | null;
      label: string | null;
      playbook: string | null;
    }>(
      `select p.nba_id::text as nba_id, p.action_type, p.cohort_id, p.root_cause, p.before_after_expected,
              m.effective_level::text as effective_level, cat.label, cat.playbook
         from gov."NBA_Proposal" p
         left join catalog."NBA_Catalogo" cat on cat.code = p.action_type
         left join lateral (
           select effective_level from gov."min_calculation" where nba_id = p.nba_id::text
           order by computed_at desc limit 1
         ) m on true
        where p.nba_id = $1::uuid
          and exists (
            select 1 from cohort."Cohort_Membership_Snapshot" cms
            join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id and r.tenant_id = $2
            where cms.cohort_id = p.cohort_id)`,
      [nbaId, tenantId],
    )
  )[0];
  if (!p) return null;
  const reach_preview = await exec<{ restaurant_id: string; tier_base: string }>(
    `select r.restaurant_id, r.tier_base::text as tier_base
       from cohort."Cohort_Membership_Snapshot" cms
       join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id and r.tenant_id = $2
      where cms.cohort_id = $1 order by r.restaurant_id limit 6`,
    [p.cohort_id, tenantId],
  );
  const reach_count =
    (
      await exec<{ n: number }>(
        `select count(distinct r.restaurant_id)::int as n
           from cohort."Cohort_Membership_Snapshot" cms
           join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id and r.tenant_id = $2
          where cms.cohort_id = $1`,
        [p.cohort_id, tenantId],
      )
    )[0]?.n ?? 0;
  const renderInput = {
    action_type: p.action_type,
    action_label: p.label,
    cohort_id: p.cohort_id,
    root_cause: p.root_cause,
    before_after_expected: p.before_after_expected,
    playbook: p.playbook,
  };
  const art = renderArtifact(renderInput);
  // The body is the restaurant-facing copy: LLM on the live path (warm, plain, actionable), deterministic
  // template under vitest / no key / any error (fail-closed §3.7). The measured [V] figures are preserved
  // verbatim by the agent's number-guard (§14). evidence/title stay server-rendered (read-only [V]).
  const body = await restaurantCopy(buildCopyInput(renderInput));
  return {
    nba_id: p.nba_id,
    action_type: p.action_type,
    action_label: p.label,
    cohort_id: p.cohort_id,
    effective_level: p.effective_level,
    reach_count,
    reach_preview,
    artifact_kind: art.artifact_kind,
    content: { ...art.content, body },
  };
}

// 02:1a — Send: the release (Release_Batch + Decision_Trace, reusing recordRelease) AND the Action_Dispatch
// row in ONE tx. Trace failure ⇒ nothing persists (caller's tx). Unique nba_id ⇒ no double dispatch.
export async function sendDispatch(
  i: Omit<ReleaseInput, "action"> & { body: string },
  client: pg.PoolClient,
): Promise<{ dispatchId: string; traceId: string }> {
  const rel = await recordRelease({ ...i, action: "RELEASE" }, client);
  const d = (
    await client.query<{
      action_type: string | null;
      cohort_id: string;
      root_cause: string | null;
      before_after_expected: unknown;
      label: string | null;
      playbook: string | null;
    }>(
      `select p.action_type, p.cohort_id, p.root_cause, p.before_after_expected, cat.label, cat.playbook
         from gov."NBA_Proposal" p
         left join catalog."NBA_Catalogo" cat on cat.code = p.action_type
        where p.nba_id = $1::uuid`,
      [i.nbaId],
    )
  ).rows[0]!;
  const target_count = (
    await client.query<{ n: number }>(
      `select count(distinct r.restaurant_id)::int as n
         from cohort."Cohort_Membership_Snapshot" cms
         join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id and r.tenant_id = $2
        where cms.cohort_id = $1`,
      [d.cohort_id, i.tenantId],
    )
  ).rows[0]!.n;
  const art = renderArtifact({
    action_type: d.action_type,
    action_label: d.label,
    cohort_id: d.cohort_id,
    root_cause: d.root_cause,
    before_after_expected: d.before_after_expected,
    playbook: d.playbook,
  });
  // The operator owns the outgoing TEXT (they may have edited the body); the measured evidence stays
  // server-rendered ([V], §14 — the human never authors the number).
  const content = { ...art.content, body: i.body };
  const ins = await client.query<{ dispatch_id: string }>(
    `insert into gov."Action_Dispatch"(nba_id, cohort_id, tenant_id, artifact_kind, content, target_count, status, decision_trace_id)
     values ($1, $2, $3, $4, $5::jsonb, $6, 'sent', $7)
     returning dispatch_id::text as dispatch_id`,
    [i.nbaId, d.cohort_id, i.tenantId, art.artifact_kind, JSON.stringify(content), target_count, rel.traceId],
  );
  return { dispatchId: ins.rows[0]!.dispatch_id, traceId: rel.traceId };
}

export const cockpitRouter = router({
  // 02:F-1.1 — the bandeja: every proposal in the pool with its autonomy verdict, AUTO-first.
  list: tenantProcedure.query(({ ctx }) => listCockpitRows(ctx.tenantId, query)),

  // 02:F-1.2 — "your week": released vs paused in the last 7 days (read from the trace, §14).
  weekSummary: tenantProcedure.query(({ ctx }) => weekSummary(ctx.tenantId, query)),

  // 02:1a — the dispatch screen read: reach + rendered artifact for a released NBA (pool-scoped).
  dispatchDetail: tenantProcedure
    .input(z.object({ nba_id: z.string().uuid() }))
    .query(({ ctx, input }) => dispatchDetail(input.nba_id, ctx.tenantId, query)),

  // 02:1a — Send: Release_Batch + Decision_Trace + Action_Dispatch in one tx (no-trace-no-action).
  sendDispatch: tenantProcedure.input(cockpitSendDispatchInput).mutation(({ ctx, input }) =>
    withTx((client) =>
      sendDispatch(
        {
          tenantId: ctx.tenantId,
          operatorId: ctx.userId,
          nbaId: input.nba_id,
          resultingLevel: input.resulting_level,
          body: input.body,
        },
        client,
      ),
    ),
  ),

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

  // 02:CP2 — "Run NBA": the engine proposes for the cohort + the AI auto-acts on the safe non-money ones.
  // tenant resolved server-side; the cohort must be in this pool (enforced in proposeAndAutoActForCohort).
  propose: tenantProcedure
    .input(cockpitProposeInput)
    .mutation(({ ctx, input }) => proposeAndAutoActForCohort(input.cohort_id, ctx.tenantId)),

  // 02:CP2 — pool-wide "Run NBA": loop the engine across the pool's problem cohorts (the cockpit button).
  proposePool: tenantProcedure.mutation(({ ctx }) => proposeForPool(ctx.tenantId)),

  // 02:CP2 — the autonomous-actions registry: what the AI did ALONE (origin='auto'), pool-scoped (read, §14).
  autoActions: tenantProcedure.query(({ ctx }) => listAutoActions(ctx.tenantId, query)),
});
