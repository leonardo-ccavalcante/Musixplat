import { TRPCError } from "@trpc/server";
import { router, tenantProcedure } from "../_core/trpc.js";
import { query, withTx } from "../db/pool.js";
import { generateFromDossier } from "../artifact/generateFromDossier.js";
import {
  generateArtifactInput,
  artifactDecisionInput,
  type GenerateArtifactResult,
  type ArtifactDecisionResult,
  type ArtifactRow,
} from "../../shared/contracts_05c.js";

// 05C artifact wedge. tenant resolved server-side; cross-pool ⇒ Security_Log + abort (BR-B6, mirrors
// diagnosis.run). generate is fail-closed (incomplete dossier / missing HOW ⇒ no row). list feeds the
// human queue (Gate 4). The decide mutation (approve/reject/escalate w/ Decision_Trace) is added in Gate 4.
export const artifactRouter = router({
  generate: tenantProcedure
    .input(generateArtifactInput)
    .mutation(async ({ ctx, input }): Promise<GenerateArtifactResult> => {
      const owner = await query<{ tenant_id: string }>(
        `select tenant_id from tenant."Diagnosed_Problem" where problem_id = $1`,
        [input.problemId],
      );
      if (!owner[0]) throw new TRPCError({ code: "NOT_FOUND", message: "unknown problem (fail-closed)" });
      if (owner[0].tenant_id !== ctx.tenantId) {
        await query(
          `insert into gov."Security_Log"(tenant_id, kind, detail) values ($1, 'cross_pool', $2)`,
          [ctx.tenantId, JSON.stringify({ piece: "05C:artifact.generate", problemId: input.problemId })],
        );
        throw new TRPCError({ code: "FORBIDDEN", message: "cross-pool artifact blocked" });
      }
      return generateFromDossier(input.problemId, ctx.tenantId);
    }),

  // Gate 4 — human exception gate: approve | reject | escalate. Writes an APPEND-ONLY Artifact_Decision
  // (4-eyes: confirmer = the human operator != proposer = the pool's AI) and flips status in the SAME tx —
  // "sin trace no hay acción" (rollback ⇒ neither persists). cross-pool ⇒ Security_Log + abort (BR-B6).
  decide: tenantProcedure
    .input(artifactDecisionInput)
    .mutation(async ({ ctx, input }): Promise<ArtifactDecisionResult> => {
      const owner = await query<{ tenant_id: string }>(
        `select tenant_id from gov."Generated_Artifact" where artifact_id = $1`,
        [input.artifactId],
      );
      if (!owner[0]) throw new TRPCError({ code: "NOT_FOUND", message: "unknown artifact (fail-closed)" });
      if (owner[0].tenant_id !== ctx.tenantId) {
        await query(
          `insert into gov."Security_Log"(tenant_id, kind, detail) values ($1, 'cross_pool', $2)`,
          [ctx.tenantId, JSON.stringify({ piece: "05C:artifact.decide", artifactId: input.artifactId })],
        );
        throw new TRPCError({ code: "FORBIDDEN", message: "cross-pool artifact blocked" });
      }
      return withTx(async (client) => {
        // 4-eyes: an independent AI proposer in the pool, != the human confirmer. Fail-closed if absent.
        const ai = (
          await client.query<{ user_id: string }>(
            `select user_id from gov."User" where tenant_id = $1 and role = 'ai_agent' order by user_id limit 1`,
            [ctx.tenantId],
          )
        ).rows[0];
        if (!ai || ai.user_id === ctx.userId) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "no independent AI proposer (4-eyes)" });
        }
        const status = input.action === "approve" ? "approved" : input.action === "reject" ? "rejected" : "escalated";
        const dec = (
          await client.query<{ decision_id: string }>(
            `insert into gov."Artifact_Decision"(artifact_id, tenant_id, action, proposer_id, confirmer_id, gate_reason)
             values ($1, $2, $3::public.artifact_action, $4, $5, 'manual_review')
             returning decision_id::text as decision_id`,
            [input.artifactId, ctx.tenantId, input.action, ai.user_id, ctx.userId],
          )
        ).rows[0]!;
        await client.query(
          `update gov."Generated_Artifact" set status = $2::public.artifact_status, decision_trace_id = $3, updated_at = now()
            where artifact_id = $1`,
          [input.artifactId, status, dec.decision_id],
        );
        // Refresh the 1:10 leverage: this human touch lowers the ratio (escalation/review up ⇒ ratio down).
        await client.query(`select gov.fn_roi_1_10($1)`, [ctx.tenantId]);
        return { artifact_id: input.artifactId, status, trace_id: dec.decision_id };
      });
    }),

  list: tenantProcedure.query(({ ctx }): Promise<ArtifactRow[]> =>
    query<ArtifactRow>(
      `select artifact_id::text as artifact_id, problem_id::text as problem_id, artifact_type, target_metric,
              status, content, decision_trace_id::text as decision_trace_id, created_at::text as created_at
         from gov."Generated_Artifact" where tenant_id = $1 order by created_at desc`,
      [ctx.tenantId],
    ),
  ),
});
