import { TRPCError } from "@trpc/server";
import { router, tenantProcedure } from "../_core/trpc.js";
import { query } from "../db/pool.js";
import { generateFromDossier } from "../artifact/generateFromDossier.js";
import { generateArtifactInput, type GenerateArtifactResult, type ArtifactRow } from "../../shared/contracts_05c.js";

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

  list: tenantProcedure.query(({ ctx }): Promise<ArtifactRow[]> =>
    query<ArtifactRow>(
      `select artifact_id::text as artifact_id, problem_id::text as problem_id, artifact_type, target_metric,
              status, content, decision_trace_id::text as decision_trace_id, created_at::text as created_at
         from gov."Generated_Artifact" where tenant_id = $1 order by created_at desc`,
      [ctx.tenantId],
    ),
  ),
});
