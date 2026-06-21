import type pg from "pg";
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { query } from "../db/pool.js";
import { type Level } from "../conversation/min.js";
import { renderArtifact } from "./renderArtifact.js";

// Audit a blocked autonomous attempt on a SEPARATE connection (Codex P2): the caller wraps autoDispatch in
// a tx, and we throw right after — logging on `client` would roll the Security_Log row back with the action,
// leaving the block un-audited in production. `query` commits independently, so the record survives.
async function logBlocked(tenantId: string, detail: Record<string, unknown>): Promise<void> {
  await query(`insert into gov."Security_Log"(tenant_id, kind, detail) values ($1,'auto_dispatch_blocked',$2::jsonb)`, [
    tenantId,
    JSON.stringify(detail),
  ]);
}

// 02:CP2 / 02:BR-5 / 04 §3.3 L280 / §7 — the AI acts ALONE on an auto_releasable, NON-money NBA. This is
// the autonomous counterpart of recordRelease/sendDispatch (which need a human operator and CLAIM
// independent confirmation). Here NO human confirms THIS action: the authorization is the operator-signed
// POLICY (tier_cap) that the auto_releasable verdict already cleared. We write Release_Batch (proposer=the
// AI, operator=the human who SIGNED that policy — the accountable authorizer) + Decision_Trace
// (origin='auto', confirmer_id=NULL ⇒ independence_guaranteed=false, the honest §3.6 marker) + Action_Dispatch
// — all in the caller's ONE tx (sin trace no acción). The autonomous body is the DETERMINISTIC render (no
// human edit, no LLM) — §14: never seeded.
//
// §7 DEFENSE-IN-DEPTH (fail-closed): re-read auto_releasable + financial_class FROM THE DB and REFUSE if the
// verdict is not a clean auto OR the action moves money — never trust the caller. A refused attempt writes a
// Security_Log row and throws (never a silent no-op), so a money / ungated NBA can never be auto-dispatched.
export interface AutoDispatchResult {
  dispatchId: string;
  traceId: string;
  releaseId: string;
}

export async function autoDispatch(
  nbaId: string,
  tenantId: string,
  client: pg.PoolClient,
): Promise<AutoDispatchResult> {
  // 1. Load the proposal + its verdict + authorizing tier, scoped to the pool (foreign pool ⇒ NOT_FOUND, no leak).
  const p = (
    await client.query<{
      cohort_id: string;
      action_type: string | null;
      root_cause: string | null;
      before_after_expected: unknown;
      financial_class: string | null;
      effective_level: Level | null;
      auto_releasable: boolean | null;
      calc_id: string | null;
      tier_base: string;
      label: string | null;
      playbook: string | null;
    }>(
      `select p.cohort_id, p.action_type, p.root_cause, p.before_after_expected,
              p.financial_class::text as financial_class,
              m.effective_level::text as effective_level, m.auto_releasable, m.calculation_id::text as calc_id,
              ct.tier_base::text as tier_base, cat.label, cat.playbook
         from gov."NBA_Proposal" p
         join cohort."Cohort" ct on ct.cohort_id = p.cohort_id
         left join catalog."NBA_Catalogo" cat on cat.code = p.action_type
         left join lateral (
           select calculation_id, effective_level, auto_releasable
           from gov."min_calculation" where nba_id = p.nba_id::text order by computed_at desc limit 1
         ) m on true
        where p.nba_id = $1::uuid
          and exists (
            select 1 from cohort."Cohort_Membership_Snapshot" cms
            join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id and r.tenant_id = $2
            where cms.cohort_id = p.cohort_id)`,
      [nbaId, tenantId],
    )
  ).rows[0];
  if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "proposal not in this pool" });

  // 2. Idempotent: one autonomous dispatch per NBA (clean CONFLICT before any write — no orphan trace).
  const dup = await client.query(`select 1 from gov."Action_Dispatch" where nba_id = $1`, [nbaId]);
  if (dup.rowCount) throw new TRPCError({ code: "CONFLICT", message: "already dispatched" });

  // 2b. Idempotent at the (pool, cohort, action) level too (Codex P1): a rerun mints a NEW nba_id, so the
  //     per-nba_id guard alone can't stop the AI re-sending the SAME action to the SAME cohort — repeated
  //     "Run NBA" clicks would duplicate the effect. One autonomous action of a given type per cohort.
  const same = await client.query(
    `select 1 from gov."Action_Dispatch" ad
       join gov."Decision_Trace" dt on dt.trace_id = ad.decision_trace_id and dt.origin = 'auto'::public.trace_origin
       join gov."NBA_Proposal" p2 on p2.nba_id::text = ad.nba_id
      where ad.tenant_id = $1 and ad.cohort_id = $2 and p2.action_type is not distinct from $3`,
    [tenantId, p.cohort_id, p.action_type],
  );
  if (same.rowCount) throw new TRPCError({ code: "CONFLICT", message: "this action already auto-acted for this cohort" });

  // 3. §7 gate (fail-closed, defense-in-depth): money NEVER auto; the verdict must be a clean auto. A refused
  //    attempt is logged (on a SEPARATE connection, survives the caller's rollback) + thrown, never a silent skip.
  const moneyBlocked = p.financial_class === "direct";
  if (moneyBlocked || p.auto_releasable !== true || !p.effective_level || !p.calc_id) {
    const reason = moneyBlocked ? "money" : "not_auto_releasable";
    await logBlocked(tenantId, { nba_id: nbaId, reason, financial_class: p.financial_class, auto_releasable: p.auto_releasable });
    throw new TRPCError({
      code: "FORBIDDEN",
      message: moneyBlocked ? "money action never auto-dispatched (§7 hard-no)" : "not auto-releasable (fail-closed)",
    });
  }

  // 4. The authorizing policy + the accountable human who signed it — and that human MUST belong to THIS pool
  //    (Codex P1): Policy_Tier is tier-keyed (global), so a tier policy signed by another pool's manager must
  //    not become this pool's autonomous authorizer. Join User and constrain tenant_id. No in-pool signed
  //    policy ⇒ fail-closed (escalate).
  const pol = (
    await client.query<{ policy_version: string; human_signature: string }>(
      `select pt.policy_version, pt.human_signature
         from gov."Policy_Tier" pt
         join gov."User" u on u.user_id = pt.human_signature and u.tenant_id = $2
        where pt.tier_id = $1 order by pt.policy_version desc limit 1`,
      [p.tier_base, tenantId],
    )
  ).rows[0];
  if (!pol) {
    await logBlocked(tenantId, { nba_id: nbaId, reason: "no_in_pool_signed_policy", tier: p.tier_base });
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "no in-pool signed policy authorizes autonomy (fail-closed)" });
  }
  // 5. The AI proposer, distinct from the policy's human ⇒ the Release_Batch 4-eyes (proposer<>operator) holds.
  const ai = (
    await client.query<{ user_id: string }>(
      `select user_id from gov."User" where tenant_id = $1 and role = 'ai_agent' order by user_id limit 1`,
      [tenantId],
    )
  ).rows[0];
  if (!ai || ai.user_id === pol.human_signature) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "no distinct AI proposer for the autonomous trace" });
  }

  // 6. Release_Batch → Decision_Trace(origin='auto', confirmer NULL) → link → Action_Dispatch, all in the tx.
  const releaseId = randomUUID();
  const traceId = randomUUID();
  await client.query(
    `insert into gov."Release_Batch"(release_id, cohort_id, action, resulting_level, proposer_id, operator_id, policy_version_validated)
     values ($1,$2,'RELEASE'::public.release_action,$3::public.autonomy_level,$4,$5,$6)`,
    [releaseId, p.cohort_id, p.effective_level, ai.user_id, pol.human_signature, pol.policy_version],
  );
  await client.query(
    `insert into gov."Decision_Trace"(trace_id, release_id, calculation_id, action, proposer_id, confirmer_id,
        effective_level_applied, policy_version, origin)
     values ($1,$2,$3::uuid,'release'::public.trace_action,$4,null,$5::public.autonomy_level,$6,'auto'::public.trace_origin)`,
    [traceId, releaseId, p.calc_id, ai.user_id, p.effective_level, pol.policy_version],
  );
  await client.query(`update gov."Release_Batch" set decision_trace_id = $1 where release_id = $2`, [traceId, releaseId]);

  const art = renderArtifact({
    action_type: p.action_type,
    action_label: p.label,
    cohort_id: p.cohort_id,
    root_cause: p.root_cause,
    before_after_expected: p.before_after_expected,
    playbook: p.playbook,
  });
  const target_count = (
    await client.query<{ n: number }>(
      `select count(distinct r.restaurant_id)::int as n
         from cohort."Cohort_Membership_Snapshot" cms
         join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id and r.tenant_id = $2
        where cms.cohort_id = $1`,
      [p.cohort_id, tenantId],
    )
  ).rows[0]!.n;
  const ins = await client.query<{ dispatch_id: string }>(
    `insert into gov."Action_Dispatch"(nba_id, cohort_id, tenant_id, artifact_kind, content, target_count, status, decision_trace_id)
     values ($1,$2,$3,$4,$5::jsonb,$6,'sent',$7) returning dispatch_id::text as dispatch_id`,
    [nbaId, p.cohort_id, tenantId, art.artifact_kind, JSON.stringify(art.content), target_count, traceId],
  );
  return { dispatchId: ins.rows[0]!.dispatch_id, traceId, releaseId };
}
