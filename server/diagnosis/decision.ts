import type pg from "pg";
import { TRPCError } from "@trpc/server";
import { withTx } from "../db/pool.js";
import type { DecideDiagnosisInput, DecideDiagnosisResult, RecentlyVerifiedRow } from "../../shared/contracts_05b.js";

export type Exec = <T extends pg.QueryResultRow>(sql: string, params: readonly unknown[]) => Promise<T[]>;

// 05D Part C — the human decision console (writes). A needs_human case was a DEAD-END (view-only); this closes
// the human side of the loop: the operator confirms/overrides the area + writes the WHY → a REVIEWED
// Knowledge_Case (grounds future runs via the RL-guard) + the problem leaves the queue. §14: no number is
// written — `resolution` is the [C] rationale, `outcome`/`reviewed` are [C] human classifications (NOT a
// measured [V]; the only [V] is Part D's verification_status). tenant + ownership resolved server-side (§7).

/** Record the operator's decision on a needs_human problem. Tenant ownership is checked first (a foreign pool
 *  ⇒ Security_Log on a SEPARATE connection so the audit survives the abort, mirrors diagnosis.run). The CLAIM
 *  (resolve the row, only if still awaiting a decision) + the learning-case insert run in ONE tx (Codex):
 *  atomic (no orphaned case if either fails) AND idempotent (a replay/concurrent call claims 0 rows ⇒ CONFLICT,
 *  never a duplicate reviewed precedent). Returns the new kb_case_id. */
export async function recordHumanDecision(
  tenantId: string,
  userId: string,
  input: DecideDiagnosisInput,
  exec: Exec,
): Promise<DecideDiagnosisResult> {
  const owner = await exec<{ tenant_id: string }>(
    `select tenant_id from tenant."Diagnosed_Problem" where problem_id = $1`,
    [input.problemId],
  );
  if (!owner[0]) throw new TRPCError({ code: "NOT_FOUND", message: "unknown problem (fail-closed)" });
  if (owner[0].tenant_id !== tenantId) {
    await exec(
      `insert into gov."Security_Log"(tenant_id, kind, detail) values ($1,'cross_pool',$2::jsonb)`,
      [tenantId, JSON.stringify({ piece: "05D:diagnosis.decide", problemId: input.problemId })],
    );
    throw new TRPCError({ code: "FORBIDDEN", message: "cross-pool decision blocked" });
  }

  // outcome/resolution/reviewed are [C] (a human classification + the WHY), never a measured number (§14).
  const prov = JSON.stringify({ outcome: "[C]", resolution: "[C]", area_type: "[C]", human_authored: "[C]" });
  const kbCaseId = await withTx(async (c) => {
    // CLAIM-FIRST: resolve the row ONLY if it is still awaiting a decision. A 2nd/concurrent call finds it
    // already resolved ⇒ 0 rows ⇒ CONFLICT BEFORE any case is written (idempotent, no orphan, §3.11).
    const claimed = await c.query(
      `update tenant."Diagnosed_Problem"
          set status = 'resolved', area_type = $2
        where problem_id = $1 and tenant_id = $3 and status in ('needs_human','blocked')
        returning problem_id`,
      [input.problemId, input.areaType, tenantId],
    );
    if (claimed.rowCount === 0) {
      throw new TRPCError({ code: "CONFLICT", message: "problem is not awaiting a decision (already decided?)" });
    }
    const kase = await c.query<{ kb_case_id: string }>(
      `insert into tenant."Knowledge_Case"
         (tenant_id, area_type, pattern, outcome, resolution, reviewed, provenance_by_field, path_used)
       values ($1,$2,$3,'resolved',$4,true,$5::jsonb,$6::jsonb)
       returning kb_case_id::text as kb_case_id`,
      [tenantId, input.areaType, `human:${input.areaType}`, input.rationale, prov,
       JSON.stringify({ human_authored: true, decided_by: userId, problem_id: input.problemId })],
    );
    return kase.rows[0]!.kb_case_id;
  });
  return { ok: true, kbCaseId };
}

/** Decision #2 audit (read): the cases the Part D re-measurement auto-approved (verification_status=
 *  'verified_fixed') — the human's visibility of the autonomous verifications. Tenant-scoped, newest first. */
export async function listRecentlyVerified(tenantId: string, exec: Exec, limit = 20): Promise<RecentlyVerifiedRow[]> {
  return exec<RecentlyVerifiedRow>(
    `select kb_case_id::text as kb_case_id, area_type, pattern, resolution, created_at::text as created_at
       from tenant."Knowledge_Case"
      where tenant_id = $1 and verification_status = 'verified_fixed'
      order by created_at desc limit $2`,
    [tenantId, limit],
  );
}
