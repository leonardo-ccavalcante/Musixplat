import { z } from "zod";

// P06 Knowledge Base / RAG — Zod contracts (single source of truth, shared by client + server).
// The 6 MECE doc types mirror server/knowledge/classify.ts DOC_TYPES (kept in lock-step).
export const docType = z.enum(["Policy", "Context", "FAQ", "Terms", "Runbook", "Other"]);
export type DocType = z.infer<typeof docType>;

// upload: client sends bytes as base64 (tenant_id is resolved server-side, never in the body — §3.4).
export const uploadInput = z.object({
  filename: z.string().min(1),
  mime: z.string().min(1),
  contentBase64: z.string().min(1),
});
export type UploadInput = z.infer<typeof uploadInput>;

// upload result: AI PROPOSES the type ([I] until a human confirms); parse_failed surfaces the reason
// (fail-closed — never a silent success, §3.7).
export const uploadResult = z.object({
  docId: z.string(),
  proposedType: docType,
  confidence: z.number(),
  status: z.enum(["proposed", "parse_failed"]),
  reason: z.string().nullable(),
});
export type UploadResult = z.infer<typeof uploadResult>;

// confirmType: human accepts/overrides the proposed type ⇒ provenance flips [I] → [V].
export const confirmTypeInput = z.object({ docId: z.string(), docType });
export type ConfirmTypeInput = z.infer<typeof confirmTypeInput>;

export const searchInput = z.object({
  query: z.string().min(1),
  topK: z.number().int().positive().max(20).optional(),
});
export type SearchInput = z.infer<typeof searchInput>;

// docType is nullable: a parse_failed doc has no type until (re)classified.
export const searchHit = z.object({
  chunkId: z.string(),
  docId: z.string(),
  filename: z.string(),
  docType: docType.nullable(),
  content: z.string(),
  similarity: z.number(),
});
export type SearchHit = z.infer<typeof searchHit>;

export const searchResult = z.object({ hits: z.array(searchHit) });
export type SearchResult = z.infer<typeof searchResult>;

// ask: the Q&A chatbot. Retrieval grounds a synthesized answer that CITES its source docs; the supporting
// hits travel with it (cite-don't-assert, DESIGN-STANDARD §3). Fail-closed — no relevant passage ⇒
// grounded=false + answer=null ("not in the base"), never an invented answer (§3.7).
export const askResult = z.object({
  grounded: z.boolean(),
  answer: z.string().nullable(),
  sources: z.array(z.object({ filename: z.string(), docType: docType.nullable() })),
  hits: z.array(searchHit),
});
export type AskResult = z.infer<typeof askResult>;

export const docRow = z.object({
  docId: z.string(),
  filename: z.string(),
  docType: docType.nullable(),
  status: z.string(),
  createdAt: z.string(),
});
export type DocRow = z.infer<typeof docRow>;
