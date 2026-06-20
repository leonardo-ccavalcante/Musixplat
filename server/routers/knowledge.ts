import { z } from "zod";
import { router, tenantProcedure } from "../_core/trpc.js";
import { extractText } from "../knowledge/parsers.js";
import { ingestDocument, searchKnowledge, answerFromBase } from "../knowledge/store.js";
import { query } from "../db/pool.js";
import { uploadInput, confirmTypeInput, searchInput } from "../../shared/contracts_knowledge.js";

// Human-readable, retryable reason for an index (embed) failure. ingestDocument is atomic — nothing
// was written — so the message tells the operator what to fix before re-uploading (never a silent 500).
function indexFailReason(e: unknown): string {
  const status = (e as { status?: number })?.status;
  if (status === 429) return "the AI service is rate-limiting right now — wait a moment and try again";
  if (status === 401 || status === 403)
    return "the AI service rejected the request (API key or quota) — check configuration and try again";
  return "could not index this file right now — please try again";
}

// P06 — Knowledge Base / RAG router. tenant_id is resolved server-side via ctx (§3.4, anti-spoofing);
// the AI PROPOSES a doc-type (text only, [I]) and a human confirms it ([V]) — never a number (§3.6).
export const knowledgeRouter = router({
  // Upload: base64 → bytes → extract text. Fail-closed — a parse failure records a parse_failed row
  // and surfaces the reason; it never silently succeeds (§3.7).
  upload: tenantProcedure.input(uploadInput).mutation(async ({ ctx, input }) => {
    const bytes = Buffer.from(input.contentBase64, "base64");
    const parsed = await extractText(bytes, input.mime, input.filename);
    if (!parsed.ok) {
      const ins = await query<{ doc_id: string }>(
        `insert into tenant."Knowledge_Document"(tenant_id,filename,mime,status)
         values ($1,$2,$3,'parse_failed') returning doc_id`,
        [ctx.tenantId, input.filename, input.mime],
      );
      return {
        docId: ins[0]!.doc_id,
        proposedType: "Other" as const,
        confidence: 0,
        status: "parse_failed" as const,
        reason: parsed.reason,
      };
    }
    try {
      const r = await ingestDocument(ctx.tenantId, {
        filename: input.filename,
        mime: input.mime,
        text: parsed.text,
      });
      return {
        docId: r.docId,
        proposedType: r.docType,
        confidence: r.confidence,
        status: "proposed" as const,
        reason: null,
      };
    } catch (e) {
      // Embedding/indexing failed after bounded retry (terminal — e.g. AI quota/rate-limit). ingest is
      // atomic, so NOTHING was written: no orphan to clean up. Surface a clear, retryable reason so the
      // operator can fix the cause and re-upload the same file cleanly (§3.7 fail-closed).
      return {
        docId: null,
        proposedType: "Other" as const,
        confidence: 0,
        status: "index_failed" as const,
        reason: indexFailReason(e),
      };
    }
  }),

  // Confirm: human accepts/overrides the proposed type ⇒ doc_type set, status=confirmed, provenance [I]→[V].
  confirmType: tenantProcedure.input(confirmTypeInput).mutation(async ({ ctx, input }) => {
    await query(
      `update tenant."Knowledge_Document"
          set doc_type=$3, status='confirmed',
              provenance_by_field = provenance_by_field || jsonb_build_object('doc_type','[V]')
        where doc_id=$1 and tenant_id=$2`,
      [input.docId, ctx.tenantId, input.docType],
    );
    return { ok: true };
  }),

  // Search: semantic retrieval over the tenant's chunks (tenant scoped inside searchKnowledge).
  search: tenantProcedure.input(searchInput).query(async ({ ctx, input }) => ({
    hits: await searchKnowledge(ctx.tenantId, input.query, input.topK, undefined, {
      processType: "kb_search",
    }),
  })),

  // Ask: the Q&A chatbot — retrieval grounds a synthesized, source-cited answer (the "G" of RAG).
  // Fail-closed: no relevant passage ⇒ grounded=false + null answer (never invented, §3.7). tenant scoped.
  ask: tenantProcedure
    .input(searchInput)
    .query(async ({ ctx, input }) => answerFromBase(ctx.tenantId, input.query)),

  // NBA tie-in: does the knowledge base hold a Policy/Terms doc relevant to this NBA? This is a
  // TEXT signal only (§3.3/§3.6) — it NEVER moves a number or auto-changes the autonomy level; the
  // human decides on the cockpit. tenant_id is resolved server-side (§3.4); the proposal is gated to
  // the caller's pool via the cohort→snapshot→restaurant chain (no cross-pool leak). NBA_Proposal has
  // no tenant_id column (it is gov/cohort-scoped), so we use the same `exists(...)` guard the cockpit
  // uses. Fail-closed: an unknown / out-of-pool nba_id ⇒ no-review (never an optimistic default, §3.7).
  nbaImpact: tenantProcedure.input(z.object({ nbaId: z.string() })).query(async ({ ctx, input }) => {
    const p = await query<{ root_cause: string | null; action_type: string | null }>(
      `select p.root_cause, p.action_type
         from gov."NBA_Proposal" p
        where p.nba_id = $1::uuid
          and exists (
            select 1 from cohort."Cohort_Membership_Snapshot" cms
            join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id and r.tenant_id = $2
            where cms.cohort_id = p.cohort_id
          )`,
      [input.nbaId, ctx.tenantId],
    );
    if (!p[0]) return { shouldReview: false, evidence: [], note: null };
    const probe = [p[0].action_type, p[0].root_cause].filter(Boolean).join(" ");
    if (!probe) return { shouldReview: false, evidence: [], note: null }; // no text to retrieve on
    const hits = await searchKnowledge(ctx.tenantId, probe, 3, undefined, {
      processType: "nba_kb_check",
      refId: input.nbaId,
    });
    const policyHits = hits.filter((h) => h.docType === "Policy" || h.docType === "Terms");
    return {
      shouldReview: policyHits.length > 0, // text signal only — human decides (§3.3); no number moved
      evidence: policyHits,
      note: policyHits.length
        ? "Knowledge base has policy/terms relevant to this NBA — review before release."
        : null,
    };
  }),

  // List: the tenant's documents, newest first.
  list: tenantProcedure.query(async ({ ctx }) => {
    const rows = await query<{
      doc_id: string;
      filename: string;
      doc_type: string | null;
      status: string;
      created_at: string;
    }>(
      `select doc_id, filename, doc_type, status, created_at
         from tenant."Knowledge_Document"
        where tenant_id=$1
        order by created_at desc`,
      [ctx.tenantId],
    );
    return rows.map((r) => ({
      docId: r.doc_id,
      filename: r.filename,
      docType: r.doc_type,
      status: r.status,
      createdAt: r.created_at,
    }));
  }),
});
