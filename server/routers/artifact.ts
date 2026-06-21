import { TRPCError } from "@trpc/server";
import { router, tenantProcedure } from "../_core/trpc.js";
import { query, withTx } from "../db/pool.js";
import { generateFromDossier } from "../artifact/generateFromDossier.js";
import { ingestDocument } from "../knowledge/store.js";

// P06 Task 9 — render an artifact's jsonb content into a flat markdown body so it can be embedded and
// retrieved as a Knowledge_Document. Deterministic + lossless of the produced fields (no LLM, §3.6/§14);
// stringifies any nested object value so a citation line ("Sources: …") survives into the indexed text.
function renderArtifactMarkdown(content: unknown): string {
  if (typeof content === "string") return content;
  if (!content || typeof content !== "object") return "";
  const c = content as Record<string, unknown>;
  const lines: string[] = [];
  if (typeof c.subject === "string") lines.push(`# ${c.subject}`);
  const body = (c.body && typeof c.body === "object") ? (c.body as Record<string, unknown>) : c;
  for (const [k, v] of Object.entries(body)) {
    if (v == null) continue;
    lines.push(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
  }
  return lines.join("\n");
}
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
      const decision = await withTx(async (client) => {
        // Lock the state transition. Only one terminal decision may leave pending_review.
        const artifact = (
          await client.query<{
            tenant_id: string;
            status: string;
            decision_trace_id: string | null;
            proposer_id: string | null;
            superseded_at: string | null;
          }>(
            `select tenant_id, status, decision_trace_id, proposer_id, superseded_at::text
               from gov."Generated_Artifact" where artifact_id=$1 for update`,
            [input.artifactId],
          )
        ).rows[0];
        if (!artifact || artifact.tenant_id !== ctx.tenantId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "artifact decision scope changed" });
        }
        if (artifact.status !== "pending_review" || artifact.decision_trace_id || artifact.superseded_at) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "artifact is already decided or superseded" });
        }
        if (!artifact.proposer_id || artifact.proposer_id === ctx.userId) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "no independent recorded proposer (4-eyes)" });
        }
        const status = input.action === "approve" ? "approved" : input.action === "reject" ? "rejected" : "escalated";
        const gateReason = input.action === "approve"
          ? "approved_after_review"
          : input.action === "reject"
            ? "rejected_incorrect_or_unsafe"
            : "escalated_requires_specialist";
        const dec = (
          await client.query<{ decision_id: string }>(
            `insert into gov."Artifact_Decision"(artifact_id, tenant_id, action, proposer_id, confirmer_id, gate_reason)
             values ($1, $2, $3::public.artifact_action, $4, $5, $6)
             returning decision_id::text as decision_id`,
            [input.artifactId, ctx.tenantId, input.action, artifact.proposer_id, ctx.userId, gateReason],
          )
        ).rows[0]!;
        const updated = await client.query(
          `update gov."Generated_Artifact" set status = $2::public.artifact_status, decision_trace_id = $3, updated_at = now()
            where artifact_id = $1 and status='pending_review' and decision_trace_id is null`,
          [input.artifactId, status, dec.decision_id],
        );
        if (updated.rowCount !== 1) throw new TRPCError({ code: "CONFLICT", message: "artifact decision lost race" });
        // Refresh the 1:10 leverage: this human touch lowers the ratio (escalation/review up ⇒ ratio down).
        await client.query(`select gov.fn_roi_1_10($1)`, [ctx.tenantId]);
        return { artifact_id: input.artifactId, status, trace_id: dec.decision_id };
      });

      // P06 Task 9 — write-back (the living base): an APPROVED dossier grows the Knowledge Base. The
      // decision above is the committed source of truth; this is a derived enrichment that runs AFTER the
      // commit, so a flaky embedding never reverses an approval (fail-closed: log + return the decision).
      // The producer (ingestDocument) fills the embedding at runtime — never seeded (§14). source marks
      // its provenance ('accepted_dossier'); the doc is retrievable immediately (the operator's "flag").
      if (decision.status === "approved") {
        try {
          const a = await query<{ content: unknown }>(
            `select content from gov."Generated_Artifact" where artifact_id=$1 and tenant_id=$2`,
            [input.artifactId, ctx.tenantId],
          );
          const text = renderArtifactMarkdown(a[0]?.content);
          if (text.length > 0) {
            await ingestDocument(ctx.tenantId, {
              filename: `accepted-${input.artifactId}.md`,
              mime: "text/markdown",
              text,
              source: "accepted_dossier",
            });
          }
        } catch (err) {
          await query(
            `insert into gov."Security_Log"(tenant_id, kind, detail) values ($1, 'kb_writeback_failed', $2)`,
            [ctx.tenantId, JSON.stringify({ piece: "P06:artifact.decide.writeback", artifactId: input.artifactId, error: String(err) })],
          );
        }
      }
      return decision;
    }),

  list: tenantProcedure.query(({ ctx }): Promise<ArtifactRow[]> =>
    query<ArtifactRow>(
      `select artifact_id::text as artifact_id, problem_id::text as problem_id, artifact_type, target_metric,
              status, content, decision_trace_id::text as decision_trace_id, created_at::text as created_at
         from gov."Generated_Artifact"
        where tenant_id = $1 and superseded_at is null
        order by created_at desc`,
      [ctx.tenantId],
    ),
  ),
});
