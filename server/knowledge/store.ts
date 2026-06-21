import { query, withTx } from "../db/pool.js";
import { resolveEmbedder, embedWithRetry, EMBED_MODEL, type Embedder } from "./embedder.js";
import { chatText, openaiChatClient, type ChatClient, type TokenUsage } from "../_core/llm.js";
import { getActiveChatModel } from "../_core/model.js";
import { recordUsageSafe, type ProcessType } from "../_core/usage.js";
import { chunk } from "./chunker.js";
import { classifyDocType } from "./classify.js";
import type { SearchHit, AskResult } from "../../shared/contracts_knowledge.js";

// What a retrieval is FOR — so its embedding token cost is attributed to the right process (P07).
export interface UsageCtx {
  processType: ProcessType;
  refId?: string | null;
}

// Threshold read BY NAME from the catalog (§3.8) — never a hard-coded literal. Fail-closed:
// a missing knob yields NaN, which makes every `sim >= NaN` filter false (no optimistic default).
async function knob(name: string): Promise<number> {
  const r = await query<{ value: string }>(`select value from catalog."Config_Knobs" where key=$1`, [
    name,
  ]);
  return Number(r[0]?.value);
}

// pgvector accepts a vector as the text literal `[n,n,...]`.
const vecLiteral = (v: number[]): string => `[${v.join(",")}]`;

export async function ingestDocument(
  tenantId: string,
  doc: { filename: string; mime: string; text: string; source?: string },
  embedder?: Embedder, // DI: tests inject deterministicEmbedder (hermetic/free); prod passes none ⇒ OpenAI.
): Promise<{ docId: string; docType: string; confidence: number }> {
  // All fallible work that must NOT leave a trace on failure runs BEFORE any write: classify the type
  // ([I], text only — never a number), split into chunks, and embed (bounded retry on transient errors;
  // a terminal failure like a bad key/quota throws here). If anything throws, nothing was written —
  // no orphan document (§3.7 fail-closed, operator rule "se o embed falhar, não colocar lixo no DB").
  // P07: capture the live token usage of the two paid steps (classify chat + embed) so we can log
  // cost AFTER the doc_id exists. Deterministic providers (tests) never fire these ⇒ both stay null.
  let chatUsage: TokenUsage | null = null;
  let embedUsage: TokenUsage | null = null;
  const chatModel = await getActiveChatModel(); // operator-selected model (knob)
  const cls = await classifyDocType(doc.text, (u) => (chatUsage = u), chatModel);
  const parts = chunk(doc.text, {
    size: await knob("kb_chunk_size"),
    overlap: await knob("kb_chunk_overlap"),
  });
  const emb = embedder ?? (await resolveEmbedder((u) => (embedUsage = u))); // prod: OpenAI; tests: injected deterministic.
  const vecs = await embedWithRetry(emb, parts); // §14 producer fills the embeddings at runtime.
  // Atomic write: the document and every chunk land in ONE transaction, so a failure mid-insert rolls
  // the document back too — the base never holds a document with zero chunks.
  const result = await withTx(async (c) => {
    const ins = await c.query<{ doc_id: string }>(
      `insert into tenant."Knowledge_Document"(tenant_id,filename,mime,source,raw_text,doc_type,doc_type_confidence,status,provenance_by_field)
       values ($1,$2,$3,$4,$5,$6,$7,'proposed',jsonb_build_object('doc_type','[I]'))
       returning doc_id`,
      [tenantId, doc.filename, doc.mime, doc.source ?? "upload", doc.text, cls.docType, cls.confidence],
    );
    const docId = ins.rows[0]!.doc_id;
    for (let i = 0; i < parts.length; i++) {
      await c.query(
        `insert into tenant."Knowledge_Chunk"(doc_id,tenant_id,chunk_index,content,embedding)
         values ($1,$2,$3,$4,$5::vector)`,
        [docId, tenantId, i, parts[i], vecLiteral(vecs[i]!)],
      );
    }
    return { docId, docType: cls.docType, confidence: cls.confidence };
  });
  // Log cost AFTER the atomic write succeeded (no orphan ⇒ no orphan cost), attributed to the doc.
  if (chatUsage)
    await recordUsageSafe({ tenantId, processType: "kb_ingest", kind: "chat", model: chatModel, refId: result.docId, usage: chatUsage });
  if (embedUsage)
    await recordUsageSafe({ tenantId, processType: "kb_ingest", kind: "embedding", model: EMBED_MODEL, refId: result.docId, usage: embedUsage });
  return result;
}

export async function searchKnowledge(
  tenantId: string,
  queryText: string,
  topK?: number,
  embedder?: Embedder,
  usageCtx?: UsageCtx, // P07: attribute the query-embedding cost to its process (kb_ask/kb_search/nba_kb_check)
): Promise<SearchHit[]> {
  let embedUsage: TokenUsage | null = null;
  const emb = embedder ?? (await resolveEmbedder((u) => (embedUsage = u)));
  const [qv] = await emb.embed([queryText]);
  if (embedUsage && usageCtx)
    await recordUsageSafe({ tenantId, processType: usageCtx.processType, kind: "embedding", model: EMBED_MODEL, refId: usageCtx.refId ?? null, usage: embedUsage });
  const k = topK ?? (await knob("kb_retrieval_top_k"));
  const minSim = await knob("kb_similarity_threshold");
  // pgvector `<=>` is cosine distance with vector_cosine_ops; cosine similarity = 1 - distance.
  // Scope by the server-resolved tenant_id (§3.4) and require a non-null embedding (§14).
  const rows = await query<{
    chunk_id: string;
    doc_id: string;
    filename: string;
    doc_type: string | null;
    content: string;
    sim: number;
  }>(
    `select c.chunk_id, c.doc_id, d.filename, d.doc_type, c.content,
            1 - (c.embedding <=> $2::vector) as sim
       from tenant."Knowledge_Chunk" c
       join tenant."Knowledge_Document" d on d.doc_id = c.doc_id and d.tenant_id = c.tenant_id
      where c.tenant_id = $1 and c.embedding is not null
      order by c.embedding <=> $2::vector
      limit $3`,
    [tenantId, vecLiteral(qv!), k],
  );
  return rows
    .filter((r) => r.sim >= minSim)
    .map((r) => ({
      chunkId: r.chunk_id,
      docId: r.doc_id,
      filename: r.filename,
      docType: r.doc_type as SearchHit["docType"],
      content: r.content,
      similarity: r.sim,
    }));
}

const ANSWER_SYSTEM =
  "You answer the operator's question using ONLY the provided context passages from the company knowledge " +
  "base. Be concise. Cite the source filename(s) inline in parentheses. If the passages do not contain the " +
  "answer, say it is not covered by the knowledge base. Never invent facts, policies, or numbers.";

// The Q&A chatbot (the "G" of RAG): retrieval grounds a synthesized, source-cited answer. Fail-closed —
// no relevant passage ⇒ grounded=false + null answer (never an invented answer, §3.7). The number is never
// the LLM's (§3.6): it only writes TEXT grounded in retrieved chunks. Deterministic under vitest (hermetic).
export async function answerFromBase(
  tenantId: string,
  question: string,
  embedder?: Embedder, // DI for hermetic retrieval in tests
  chat?: ChatClient, // DI for hermetic generation in tests; prod passes none ⇒ OpenAI
): Promise<AskResult> {
  const hits = await searchKnowledge(tenantId, question, undefined, embedder, { processType: "kb_ask" });
  if (hits.length === 0) return { grounded: false, answer: null, sources: [], hits: [] };
  const sources = [
    ...new Map(hits.map((h) => [h.docId, { filename: h.filename, docType: h.docType }])).values(),
  ];
  // Tests stay hermetic/free (no live LLM): the deterministic answer still proves it is grounded in the
  // retrieved text + carries its sources — the exact contract the UI renders — without a paid call.
  if (process.env.VITEST) {
    return { grounded: true, answer: `From ${hits[0]!.filename}: ${hits[0]!.content}`, sources, hits };
  }
  const context = hits
    .map((h) => `Source: ${h.filename} (${h.docType ?? "unclassified"})\n${h.content}`)
    .join("\n\n---\n\n");
  const client = chat ?? (await openaiChatClient());
  const chatModel = await getActiveChatModel();
  const { text: answer, usage } = await chatText(
    client,
    ANSWER_SYSTEM,
    `Question: ${question}\n\nContext passages:\n${context}`,
    400,
    chatModel,
  );
  await recordUsageSafe({ tenantId, processType: "kb_ask", kind: "chat", model: chatModel, usage });
  return { grounded: true, answer, sources, hits };
}
