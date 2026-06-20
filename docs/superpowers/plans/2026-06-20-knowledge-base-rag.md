# Knowledge Base (RAG · pgvector) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/knowledge` screen + RAG substrate so an operator uploads docs (PDF/MD/…), the AI proposes a doc-type the human confirms, the doc is chunked+embedded into pgvector, and every case answer first runs a semantic search over that store — grounding the response, citing the source, informing the NBA, and growing the base when a dossier is accepted.

**Architecture:** New vector substrate (`tenant."Knowledge_Document"` + `tenant."Knowledge_Chunk"` with `vector(1536)`) sitting *beside* the existing `Knowledge_Case` (case resolutions, untouched). An embedder abstracted exactly like `server/diagnosis/reasoning.ts` (`hasKey ? openaiEmbedder : deterministicEmbedder`) so CI/anti-fake tests run without a paid key. Retrieval is wired into the existing diagnosis spine (B.6 grounding point in `orchestrator.ts`) and the dossier renderer (`generateFromDossier.ts`) so answers cite their source; the accept hook (`artifact.decide` approve branch) vectorizes the accepted dossier back into the store; an NBA-impact read consumes `nbaCockpitRow`/`NBA_Proposal`.

**Tech Stack:** TypeScript strict · Postgres + pgvector · `openai` SDK (embeddings) · `@anthropic-ai/sdk` (doc-type classification, already wired) · `unpdf` (ESM PDF text extraction) · tRPC v11 · React 19 + wouter + shadcn/Tailwind · Vitest + pgTAP + Playwright.

**Branch:** create `feat/p06-knowledge-rag` off `main` before Task 1 (CLAUDE.md §6 — never build on default branch). 1 piece = 1 commit.

---

## §3 invariant compliance (CLAUDE.md — non-negotiable, mapped per relevant task)

- **§3.1 anti-fake / NULL-pre-run** — `embedding` is filled only by the named embed producer; no row is seeded with an embedding. Anti-fake test: after seed, before any upload, `Knowledge_Chunk` is empty and search returns `[]`. (Task 13)
- **§3.4 RLS single-pool** — every doc/chunk row carries `tenant_id`; all reads go through `queryForTenant` / `tenantProcedure` (server-resolved tenant, never client body). Cross-pool search returns nothing + logs. (Tasks 1, 6, 13)
- **§3.6 deterministic-never-LLM** — embeddings index *text retrieval*, not a KPI/financial number; the AI only proposes a **doc-type string** and grounding **text**, never a number. The NBA recommendation is text + a Decision_Trace; the human decides. (Tasks 5, 11)
- **§3.7 fail-closed** — missing/garbled file ⇒ no chunks, doc flagged `parse_failed`, no silent success. Low-confidence classification ⇒ `docType='Other'`, `needs_human`. Search with embedder error ⇒ empty + logged, never a fabricated hit. (Tasks 2, 5, 6)
- **§3.8 knobs by name** — `kb_chunk_size`, `kb_chunk_overlap`, `kb_retrieval_top_k`, `kb_similarity_threshold`, `kb_classification_floor` read from `catalog."Config_Knobs"` by name, never literals. (Task 1 seeds them; Tasks 3/5/6 read them)
- **§3.10 provenance per field** — `Knowledge_Document.doc_type` carries `[I]` (AI-inferred) until human confirms → `[V]`; no provenance ⇒ no render. `provenance_by_field jsonb` on both new tables. (Tasks 1, 4)
- **§6 secrets by name** — `OPENAI_API_KEY` referenced by name in `.env.example`; never a literal value committed. (Task 3)

---

## File structure

**Create**
- `supabase/migrations/20260620000001_knowledge_pgvector.sql` — pgvector extension + 2 tables + enum + indexes; knobs seeded in `seed.sql`.
- `server/knowledge/embedder.ts` — `Embedder` interface + `openaiEmbedder` + `deterministicEmbedder` + factory.
- `server/knowledge/chunker.ts` — text → overlapping chunks.
- `server/knowledge/parsers.ts` — file bytes → raw text (PDF/MD/TXT registry).
- `server/knowledge/classify.ts` — AI proposes doc-type over the closed MECE list (LLM + deterministic fallback).
- `server/knowledge/store.ts` — DB ops: insert doc+chunks, semantic search, write-back from dossier.
- `server/routers/knowledge.ts` — tRPC: `upload`, `confirmType`, `search`, `list`, `nbaImpact`.
- `shared/contracts_knowledge.ts` — Zod contracts (single source of truth, imported both sides).
- `client/src/pages/KnowledgePage.tsx` — the `/knowledge` screen.
- `client/src/features/knowledge/UploadModal.tsx` — upload + AI-proposed-type confirm.
- `client/src/features/knowledge/DocList.tsx` — uploaded docs + status.
- `client/src/features/knowledge/SearchTester.tsx` — query box to verify retrieval.
- Tests: `tests/knowledge/chunker.test.ts`, `tests/knowledge/embedder.test.ts`, `tests/knowledge/classify.test.ts`, `tests/integration/knowledge_roundtrip.test.ts`, `tests/integration/knowledge_rls.test.ts`, `tests/antifake/knowledge_nullprerun.test.ts`, `e2e/knowledge.spec.ts`, `a11y` covered by existing axe sweep.

**Modify**
- `package.json` — add `openai`, `unpdf` deps.
- `.env.example` — add `OPENAI_API_KEY` (name only).
- `supabase/seed.sql` — seed the 5 `kb_*` knobs (config, not results).
- `server/routers/_app.ts` (root router) — mount `knowledge` router.
- `server/diagnosis/orchestrator.ts:127-138` — add semantic retrieval at the B.6 grounding step; persist `kb_doc_refs`.
- `server/artifact/generateFromDossier.ts:19-97` — cite retrieved doc(s) + provenance in the artifact.
- `server/routers/artifact.ts:77-99` — on `approve`, vectorize the accepted dossier into the store (write-back).
- `supabase/migrations/...` (same Task 1 file) — add `kb_doc_refs jsonb` to `tenant."Diagnosed_Problem"`.
- `client/src/App.tsx:43-48` — register `<Route path="/knowledge">`.
- nav component — add a "Knowledge" link.

**Untouched (verified [V] this session):** `tenant."Knowledge_Case"` and its area_type grounding stay exactly as-is — semantic retrieval *augments*, never replaces, the deterministic fail-closed path ([V] orchestrator.ts:72-88, 127-138).

---

## Closed MECE doc-type taxonomy (locked with operator)

`enum public.kb_doc_type as ('Policy','Context','FAQ','Terms','Runbook','Other')` — mirrors the C1 artifact-type router's closed-list discipline. AI proposes one; human confirms/overrides on `/knowledge`.

---

### Task 1: pgvector substrate + tables + knobs

**Files:**
- Create: `supabase/migrations/20260620000001_knowledge_pgvector.sql`
- Modify: `supabase/seed.sql` (append 5 `kb_*` knob rows)
- Test: `tests/knowledge/migration.sql` (pgTAP)

- [ ] **Step 1: Write the failing pgTAP test**

```sql
-- tests/knowledge/migration.sql
begin;
select plan(7);
select has_extension('vector');
select has_table('tenant', 'Knowledge_Document', 'doc table exists');
select has_table('tenant', 'Knowledge_Chunk', 'chunk table exists');
select has_column('tenant', 'Knowledge_Chunk', 'embedding', 'embedding column exists');
select col_is_null('tenant', 'Knowledge_Chunk', 'embedding',
  'embedding is nullable — §14 NULL-pre-run, filled only by producer');
select has_column('tenant', 'Diagnosed_Problem', 'kb_doc_refs', 'dossier carries doc citations');
select results_eq(
  $$select count(*)::int from catalog."Config_Knobs" where key like 'kb\_%'$$,
  $$values (5)$$, '5 kb_* knobs seeded');
select * from finish();
rollback;
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm test:sql`
Expected: FAIL (extension/tables absent).

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260620000001_knowledge_pgvector.sql
-- P06 Knowledge Base / RAG substrate. DDL only — no embeddings seeded (§14 NULL-pre-run).
-- RLS deferred per 04 §13; active enforcement = server-side tenantProcedure guard.

create extension if not exists vector;

create type public.kb_doc_type as enum ('Policy','Context','FAQ','Terms','Runbook','Other');
create type public.kb_doc_status as enum ('proposed','confirmed','parse_failed');

create table tenant."Knowledge_Document" (
  doc_id              uuid primary key default gen_random_uuid(),
  tenant_id           text not null,                       -- pool / RLS frontier
  filename            text not null,
  mime                text not null,
  source              text not null default 'upload',      -- 'upload' | 'accepted_dossier'
  raw_text            text,                                 -- extracted text (null if parse_failed)
  doc_type            public.kb_doc_type,                   -- RESULT §14 — AI proposes, NULL pre-run
  doc_type_confidence numeric,                              -- [C] classifier confidence
  status              public.kb_doc_status not null default 'proposed',
  provenance_by_field jsonb not null default '{}'::jsonb,   -- doc_type:[I] until human confirm → [V]
  created_at          timestamptz not null default now()
);
create index knowledge_doc_tenant_idx on tenant."Knowledge_Document"(tenant_id);

create table tenant."Knowledge_Chunk" (
  chunk_id    uuid primary key default gen_random_uuid(),
  doc_id      uuid not null references tenant."Knowledge_Document"(doc_id) on delete cascade,
  tenant_id   text not null,
  chunk_index integer not null,
  content     text not null,
  embedding   vector(1536),                                 -- RESULT §14 — filled only by embed producer
  created_at  timestamptz not null default now()
);
create index knowledge_chunk_tenant_idx on tenant."Knowledge_Chunk"(tenant_id);
-- cosine HNSW; built now, populated by the producer (empty index is valid).
create index knowledge_chunk_embedding_idx
  on tenant."Knowledge_Chunk" using hnsw (embedding vector_cosine_ops);

alter table tenant."Diagnosed_Problem"
  add column if not exists kb_doc_refs jsonb not null default '[]'::jsonb;  -- citations (dossier source)
```

- [ ] **Step 4: Seed the knobs (config, not results)**

```sql
-- append to supabase/seed.sql — Config_Knobs shape is (key, value, provenance, owner) [V] verified
insert into catalog."Config_Knobs"(key, value, provenance, owner) values
  ('kb_chunk_size','1200','[C]','p06'),
  ('kb_chunk_overlap','150','[C]','p06'),
  ('kb_retrieval_top_k','5','[C]','p06'),
  ('kb_similarity_threshold','0.30','[C]','p06'),
  ('kb_classification_floor','0.55','[C]','p06')
on conflict (key) do nothing;
```

- [ ] **Step 5: Reset DB + run tests**

Run: `supabase db reset && pnpm test:sql`
Expected: PASS (7/7).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260620000001_knowledge_pgvector.sql supabase/seed.sql tests/knowledge/migration.sql
git commit -m "feat(p06): pgvector substrate — Knowledge_Document/Chunk + kb_* knobs (04 §3/§14)"
```

---

### Task 2: file parsers (PDF/MD/TXT) — fail-closed

**Files:**
- Create: `server/knowledge/parsers.ts`
- Modify: `package.json` (add `unpdf`)
- Test: `tests/knowledge/parsers.test.ts`

- [ ] **Step 1: Failing test**

```ts
// tests/knowledge/parsers.test.ts
import { describe, it, expect } from "vitest";
import { extractText } from "../../server/knowledge/parsers.js";

describe("extractText", () => {
  it("passes through markdown/plain text", async () => {
    const buf = Buffer.from("# Refund Policy\nRefunds within 30 days.", "utf-8");
    const r = await extractText(buf, "text/markdown", "policy.md");
    expect(r.ok).toBe(true);
    expect(r.ok && r.text).toContain("Refund Policy");
  });
  it("fail-closed on unsupported mime", async () => {
    const r = await extractText(Buffer.from("x"), "image/png", "x.png");
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm test tests/knowledge/parsers.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// server/knowledge/parsers.ts
export type ParseResult = { ok: true; text: string } | { ok: false; reason: string };

const TEXT_MIMES = new Set(["text/markdown", "text/plain", "text/x-markdown"]);

export async function extractText(bytes: Buffer, mime: string, filename: string): Promise<ParseResult> {
  try {
    if (mime === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      const { text } = await pdfText(pdf, { mergePages: true });
      const joined = Array.isArray(text) ? text.join("\n") : text;
      if (!joined.trim()) return { ok: false, reason: "empty_pdf" };  // §3.7 fail-closed
      return { ok: true, text: joined };
    }
    if (TEXT_MIMES.has(mime) || /\.(md|markdown|txt)$/i.test(filename)) {
      const text = bytes.toString("utf-8");
      if (!text.trim()) return { ok: false, reason: "empty_text" };
      return { ok: true, text };
    }
    return { ok: false, reason: `unsupported_mime:${mime}` };
  } catch (e) {
    return { ok: false, reason: `parse_error:${(e as Error).message}` };
  }
}
```

- [ ] **Step 4: Add dep + run**

Run: `pnpm add unpdf && pnpm test tests/knowledge/parsers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/knowledge/parsers.ts package.json pnpm-lock.yaml tests/knowledge/parsers.test.ts
git commit -m "feat(p06): file parsers (PDF via unpdf, MD/TXT) — fail-closed on unsupported/empty"
```

---

### Task 3: embedder abstraction (OpenAI + deterministic fallback)

**Files:**
- Create: `server/knowledge/embedder.ts`
- Modify: `package.json` (add `openai`), `.env.example` (add `OPENAI_API_KEY` name)
- Test: `tests/knowledge/embedder.test.ts`

- [ ] **Step 1: Failing test (determinism + dimension)**

```ts
// tests/knowledge/embedder.test.ts
import { describe, it, expect } from "vitest";
import { deterministicEmbedder } from "../../server/knowledge/embedder.js";

describe("deterministicEmbedder", () => {
  it("returns 1536-dim normalized vectors, stable per input", async () => {
    const [a] = await deterministicEmbedder.embed(["refund policy"]);
    const [b] = await deterministicEmbedder.embed(["refund policy"]);
    expect(a).toHaveLength(1536);
    expect(a).toEqual(b);                       // deterministic
    const norm = Math.hypot(...a);
    expect(norm).toBeCloseTo(1, 5);             // unit length → cosine well-defined
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm test tests/knowledge/embedder.test.ts` — FAIL.

- [ ] **Step 3: Implement (mirror reasoning.ts DI pattern)**

```ts
// server/knowledge/embedder.ts
import { createHash } from "node:crypto";

export const EMBED_DIM = 1536;
export interface Embedder { embed(texts: string[]): Promise<number[][]>; }

// Deterministic, key-free embedder for CI/anti-fake/tests. Hash → seeded pseudo-vector → unit-normalized.
// NOT semantic; only guarantees stable, dimension-correct vectors so the pipeline+SQL exercise end-to-end.
export const deterministicEmbedder: Embedder = {
  async embed(texts) {
    return texts.map((t) => {
      const v = new Array<number>(EMBED_DIM);
      let seed = createHash("sha256").update(t).digest();
      for (let i = 0; i < EMBED_DIM; i++) {
        if (i % 32 === 0) seed = createHash("sha256").update(seed).digest();
        v[i] = (seed[i % 32]! / 255) * 2 - 1;
      }
      const norm = Math.hypot(...v) || 1;
      return v.map((x) => x / norm);
    });
  },
};

export function openaiEmbedder(client: { embeddings: { create(a: { model: string; input: string[] }): Promise<{ data: { embedding: number[] }[] }> } }, model = "text-embedding-3-small"): Embedder {
  return {
    async embed(texts) {
      const res = await client.embeddings.create({ model, input: texts });
      return res.data.map((d) => d.embedding);   // 1536 dims for text-embedding-3-small
    },
  };
}

// Factory — prod uses OpenAI when the key is present, else deterministic (CLAUDE.md §6 secret by name).
export async function resolveEmbedder(): Promise<Embedder> {
  if (!process.env.OPENAI_API_KEY) return deterministicEmbedder;
  const { default: OpenAI } = await import("openai");
  return openaiEmbedder(new OpenAI() as never);
}
```

- [ ] **Step 4: Add dep + env name + run**

Run: `pnpm add openai`
Append to `.env.example`: `OPENAI_API_KEY=            # embeddings (text-embedding-3-small) for Knowledge Base RAG; empty → deterministic fallback`
Run: `pnpm test tests/knowledge/embedder.test.ts` — PASS.

- [ ] **Step 5: Commit**

```bash
git add server/knowledge/embedder.ts package.json pnpm-lock.yaml .env.example tests/knowledge/embedder.test.ts
git commit -m "feat(p06): embedder DI — OpenAI text-embedding-3-small + deterministic fallback (CLAUDE.md §6)"
```

---

### Task 4: chunker

**Files:** Create `server/knowledge/chunker.ts`; Test `tests/knowledge/chunker.test.ts`

- [ ] **Step 1: Failing test**

```ts
// tests/knowledge/chunker.test.ts
import { describe, it, expect } from "vitest";
import { chunk } from "../../server/knowledge/chunker.js";

describe("chunk", () => {
  it("splits with overlap and preserves order", () => {
    const text = "a".repeat(2500);
    const parts = chunk(text, { size: 1200, overlap: 150 });
    expect(parts.length).toBeGreaterThan(1);
    expect(parts[0]).toHaveLength(1200);
    // overlap: end of chunk0 reappears at start of chunk1
    expect(parts[1]!.startsWith(parts[0]!.slice(-150))).toBe(true);
  });
  it("returns single chunk when text fits", () => {
    expect(chunk("short", { size: 1200, overlap: 150 })).toEqual(["short"]);
  });
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement**

```ts
// server/knowledge/chunker.ts
export function chunk(text: string, opts: { size: number; overlap: number }): string[] {
  const { size, overlap } = opts;
  if (text.length <= size) return [text];
  const step = Math.max(1, size - overlap);
  const out: string[] = [];
  for (let i = 0; i < text.length; i += step) {
    out.push(text.slice(i, i + size));
    if (i + size >= text.length) break;
  }
  return out;
}
```

- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** `feat(p06): text chunker (size+overlap, knob-driven)`

---

### Task 5: AI doc-type classifier (propose, fail-closed)

**Files:** Create `server/knowledge/classify.ts`; Test `tests/knowledge/classify.test.ts`

- [ ] **Step 1: Failing test (deterministic provider)**

```ts
// tests/knowledge/classify.test.ts
import { describe, it, expect } from "vitest";
import { deterministicClassify } from "../../server/knowledge/classify.js";

describe("deterministicClassify", () => {
  it("maps refund/cancellation wording to Policy", () => {
    const r = deterministicClassify("This refund and cancellation policy governs releases.");
    expect(r.docType).toBe("Policy");
    expect(r.confidence).toBeGreaterThan(0);
  });
  it("fail-closed to Other on no signal", () => {
    expect(deterministicClassify("zzz qqq").docType).toBe("Other");
  });
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement (LLM via Anthropic + deterministic fallback, mirrors reasoning.ts)**

```ts
// server/knowledge/classify.ts
import type Anthropic from "@anthropic-ai/sdk";

export const DOC_TYPES = ["Policy", "Context", "FAQ", "Terms", "Runbook", "Other"] as const;
export type DocType = (typeof DOC_TYPES)[number];
export interface DocClassification { docType: DocType; confidence: number; }

const RULES: Array<[DocType, RegExp]> = [
  ["Policy", /\b(policy|policies|refund|cancellation|compliance|governs|must not|prohibit)\b/i],
  ["Terms", /\b(terms|conditions|t&c|agreement|liability|warranty)\b/i],
  ["FAQ", /\b(faq|frequently asked|q:|how do i|common questions)\b/i],
  ["Runbook", /\b(runbook|step \d|procedure|escalat|on-call|playbook)\b/i],
  ["Context", /\b(about us|company|background|overview|context|mission)\b/i],
];

export function deterministicClassify(text: string): DocClassification {
  for (const [type, re] of RULES) if (re.test(text)) return { docType: type, confidence: 0.7 };
  return { docType: "Other", confidence: 0.3 };  // §3.7 fail-closed conservative
}

export function llmClassify(client: Anthropic, model = "claude-sonnet-4-6") {
  return async (text: string): Promise<DocClassification> => {
    const res = await client.messages.create({
      model, max_tokens: 64,
      system: `Classify a company document into EXACTLY one of: ${DOC_TYPES.join(", ")}. Reply ONLY JSON {"docType":"...","confidence":0..1}.`,
      messages: [{ role: "user", content: text.slice(0, 6000) }],
    });
    const raw = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    const json = JSON.parse(raw.replace(/^```(json)?|```$/g, "").trim()) as DocClassification;
    if (!DOC_TYPES.includes(json.docType)) throw new Error("classify: type off-list"); // fail-closed, no guess
    return json;
  };
}

export async function classifyDocType(text: string): Promise<DocClassification> {
  if (!process.env.ANTHROPIC_API_KEY) return deterministicClassify(text);
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  try { return await llmClassify(new Anthropic())(text); }
  catch { return deterministicClassify(text); }  // degrade to deterministic, never throw to user
}
```

- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** `feat(p06): doc-type classifier — closed MECE list, LLM proposes + deterministic fallback (§3.6/§3.7)`

---

### Task 6: store ops (insert doc+chunks, semantic search) + contracts

**Files:** Create `server/knowledge/store.ts`, `shared/contracts_knowledge.ts`; Test `tests/integration/knowledge_roundtrip.test.ts`

- [ ] **Step 1: Contracts**

```ts
// shared/contracts_knowledge.ts
import { z } from "zod";
export const docType = z.enum(["Policy", "Context", "FAQ", "Terms", "Runbook", "Other"]);
export const uploadInput = z.object({
  filename: z.string().min(1), mime: z.string().min(1), contentBase64: z.string().min(1),
});
export const uploadResult = z.object({
  docId: z.string(), proposedType: docType, confidence: z.number(), status: z.enum(["proposed", "parse_failed"]), reason: z.string().nullable(),
});
export const confirmTypeInput = z.object({ docId: z.string(), docType });
export const searchInput = z.object({ query: z.string().min(1), topK: z.number().int().positive().max(20).optional() });
export const searchHit = z.object({ chunkId: z.string(), docId: z.string(), filename: z.string(), docType: docType.nullable(), content: z.string(), similarity: z.number() });
export const searchResult = z.object({ hits: z.array(searchHit) });
export const docRow = z.object({ docId: z.string(), filename: z.string(), docType: docType.nullable(), status: z.string(), createdAt: z.string() });
export type SearchHit = z.infer<typeof searchHit>;
```

- [ ] **Step 2: Failing integration test (round-trip, anti-fake before upload)**

```ts
// tests/integration/knowledge_roundtrip.test.ts
import { describe, it, expect } from "vitest";
import { searchKnowledge, ingestDocument } from "../../server/knowledge/store.js";
import { deterministicEmbedder as E } from "../../server/knowledge/embedder.js";  // hermetic: no OpenAI call, no cost

const T = "pool-test-kb";
describe("knowledge round-trip", () => {
  it("returns no hits before any upload (§14 NULL-pre-run)", async () => {
    const r = await searchKnowledge(T, "refund", 5, E);
    expect(r).toEqual([]);
  });
  it("ingests then retrieves the doc as a cited hit", async () => {
    await ingestDocument(T, { filename: "policy.md", mime: "text/markdown", text: "Refunds are issued within 30 days of a failed payment." }, E);
    const hits = await searchKnowledge(T, "Refunds are issued within 30 days of a failed payment.", 5, E);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.filename).toBe("policy.md");
  });
  it("does NOT leak another pool's docs (§3.4 RLS)", async () => {
    const hits = await searchKnowledge("pool-other", "refund", 5, E);
    expect(hits.find((h) => h.filename === "policy.md")).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run — FAIL.**

- [ ] **Step 4: Implement store**

```ts
// server/knowledge/store.ts
import { query } from "../db/pool.js";  // [V] query<T>(text,params):Promise<T[]> exported here
import { resolveEmbedder, type Embedder } from "./embedder.js";
import { chunk } from "./chunker.js";
import { classifyDocType } from "./classify.js";
import type { SearchHit } from "../../shared/contracts_knowledge.js";

async function knob(name: string): Promise<number> {
  const r = await query<{ value: string }>(`select value from catalog."Config_Knobs" where key=$1`, [name]);
  return Number(r[0]?.value);
}
const vecLiteral = (v: number[]) => `[${v.join(",")}]`;  // pgvector text input

export async function ingestDocument(
  tenantId: string,
  doc: { filename: string; mime: string; text: string; source?: string },
  embedder?: Embedder,                                                  // DI: tests inject deterministicEmbedder (hermetic/free)
): Promise<{ docId: string; docType: string; confidence: number }> {
  const cls = await classifyDocType(doc.text);                         // AI proposes (text only)
  const ins = await query<{ doc_id: string }>(
    `insert into tenant."Knowledge_Document"(tenant_id,filename,mime,source,raw_text,doc_type,doc_type_confidence,status,provenance_by_field)
     values ($1,$2,$3,$4,$5,$6,$7,'proposed',jsonb_build_object('doc_type','[I]'))
     returning doc_id`,
    [tenantId, doc.filename, doc.mime, doc.source ?? "upload", doc.text, cls.docType, cls.confidence],
  );
  const docId = ins[0]!.doc_id;
  const parts = chunk(doc.text, { size: await knob("kb_chunk_size"), overlap: await knob("kb_chunk_overlap") });
  const emb = embedder ?? (await resolveEmbedder());                   // prod: OpenAI; tests: injected deterministic
  const vecs = await emb.embed(parts);                                 // §14 producer fills embeddings
  for (let i = 0; i < parts.length; i++) {
    await query(
      `insert into tenant."Knowledge_Chunk"(doc_id,tenant_id,chunk_index,content,embedding)
       values ($1,$2,$3,$4,$5::vector)`,
      [docId, tenantId, i, parts[i], vecLiteral(vecs[i]!)],
    );
  }
  return { docId, docType: cls.docType, confidence: cls.confidence };
}

export async function searchKnowledge(tenantId: string, queryText: string, topK?: number, embedder?: Embedder): Promise<SearchHit[]> {
  const emb = embedder ?? (await resolveEmbedder());
  const [qv] = await emb.embed([queryText]);
  const k = topK ?? (await knob("kb_retrieval_top_k"));
  const minSim = await knob("kb_similarity_threshold");
  // cosine distance = 1 - cosine_similarity; pgvector <=> is cosine distance with vector_cosine_ops.
  const rows = await query<{ chunk_id: string; doc_id: string; filename: string; doc_type: string | null; content: string; sim: number }>(
    `select c.chunk_id, c.doc_id, d.filename, d.doc_type, c.content,
            1 - (c.embedding <=> $2::vector) as sim
       from tenant."Knowledge_Chunk" c
       join tenant."Knowledge_Document" d on d.doc_id = c.doc_id and d.tenant_id = c.tenant_id
      where c.tenant_id = $1 and c.embedding is not null
      order by c.embedding <=> $2::vector
      limit $3`,
    [tenantId, vecLiteral(qv!), k],
  );
  return rows.filter((r) => r.sim >= minSim).map((r) => ({
    chunkId: r.chunk_id, docId: r.doc_id, filename: r.filename, docType: r.doc_type as SearchHit["docType"], content: r.content, similarity: r.sim,
  }));
}
```

- [ ] **Step 5: Run integration (DB up)**

Run: `RLS_TESTS_ENABLED=1 pnpm test:integration tests/integration/knowledge_roundtrip.test.ts`
Expected: PASS. The deterministic embedder is NON-semantic (hash-seeded), so an unrelated word like "refund" lands at cosine ≈ -0.02 (below kb_similarity_threshold) — it does NOT match the seeded doc. Tests that must retrieve a hit (the round-trip and the cross-pool isolation test) therefore query with the EXACT chunk text, which yields cosine ≈ 1.0. Using exact text in the cross-pool test is what keeps it non-vacuous: a regression of the `where c.tenant_id = $1` guard (§3.4) would leak the doc at sim 1.0 and fail the assertion.

- [ ] **Step 6: Commit** `feat(p06): knowledge store — ingest (chunk+embed) + cosine search, tenant-scoped (§3.4/§3.8/§14)`

---

### Task 7: tRPC router (upload, confirmType, search, list)

**Files:** Create `server/routers/knowledge.ts`; Modify root router `server/routers/_app.ts`; Test covered by Task 6 + e2e.

- [ ] **Step 1: Implement router**

```ts
// server/routers/knowledge.ts
import { router, tenantProcedure } from "../_core/trpc.js";  // [V] verified: router/tenantProcedure live here
import { extractText } from "../knowledge/parsers.js";
import { ingestDocument, searchKnowledge } from "../knowledge/store.js";
import { query } from "../db/pool.js";
import { uploadInput, confirmTypeInput, searchInput } from "../../shared/contracts_knowledge.js";

export const knowledgeRouter = router({
  upload: tenantProcedure.input(uploadInput).mutation(async ({ ctx, input }) => {
    const bytes = Buffer.from(input.contentBase64, "base64");
    const parsed = await extractText(bytes, input.mime, input.filename);
    if (!parsed.ok) {
      const ins = await query<{ doc_id: string }>(
        `insert into tenant."Knowledge_Document"(tenant_id,filename,mime,status) values ($1,$2,$3,'parse_failed') returning doc_id`,
        [ctx.tenantId, input.filename, input.mime],
      );
      return { docId: ins[0]!.doc_id, proposedType: "Other" as const, confidence: 0, status: "parse_failed" as const, reason: parsed.reason };
    }
    const r = await ingestDocument(ctx.tenantId, { filename: input.filename, mime: input.mime, text: parsed.text });
    return { docId: r.docId, proposedType: r.docType, confidence: r.confidence, status: "proposed" as const, reason: null };
  }),

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

  search: tenantProcedure.input(searchInput).query(async ({ ctx, input }) =>
    ({ hits: await searchKnowledge(ctx.tenantId, input.query, input.topK) })),

  list: tenantProcedure.query(async ({ ctx }) => {
    const rows = await query<{ doc_id: string; filename: string; doc_type: string | null; status: string; created_at: string }>(
      `select doc_id, filename, doc_type, status, created_at from tenant."Knowledge_Document" where tenant_id=$1 order by created_at desc`,
      [ctx.tenantId],
    );
    return rows.map((r) => ({ docId: r.doc_id, filename: r.filename, docType: r.doc_type, status: r.status, createdAt: r.created_at }));
  }),
});
```

- [ ] **Step 2: Mount on root router** — add `knowledge: knowledgeRouter` to `server/routers/_app.ts` (match existing mount style: `diagnosis`, `intake`, `artifact`, `nba`).
- [ ] **Step 3: Typecheck** `pnpm typecheck` — PASS.
- [ ] **Step 4: Commit** `feat(p06): knowledge tRPC router — upload/confirmType/search/list (tenant-scoped)`

---

### Task 8: wire retrieval into the diagnosis spine + cite source

**Files:** Modify `server/diagnosis/orchestrator.ts:127-138`, `server/artifact/generateFromDossier.ts:19-97`; Test `tests/integration/knowledge_grounds_answer.test.ts`

- [ ] **Step 1: Failing test** — upload a refund policy, run the spine on a payment case, assert `Diagnosed_Problem.kb_doc_refs` contains the doc and the generated artifact text references the filename.

```ts
// tests/integration/knowledge_grounds_answer.test.ts (sketch — fill against real run helpers)
// 1. ingestDocument(T, refund policy md)
// 2. run spine for a payment_not_executed case in pool T
// 3. expect kb_doc_refs non-empty AND artifact content includes the policy filename
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Augment B.6 grounding (do NOT remove the area_type path — §3 invariant)**

In `orchestrator.ts`, right after the existing `similar_links` update (line ~137), add:

```ts
// B.6.5 semantic grounding over the uploaded knowledge base (augments area_type match; §3.6 text-only).
const kbHits = await searchKnowledge(tenantId, top.hypothesis ?? prob.text ?? cls.areaType, undefined);
if (kbHits.length) {
  await query(
    `update tenant."Diagnosed_Problem"
        set kb_doc_refs = $2::jsonb,
            provenance_by_field = provenance_by_field || jsonb_build_object('kb_doc_refs','[C]')
      where problem_id = $1 and tenant_id = $3`,
    [problemId, JSON.stringify(kbHits.map((h) => ({ docId: h.docId, filename: h.filename, docType: h.docType, similarity: h.similarity }))), tenantId],
  );
}
```

- [ ] **Step 4: Cite source in the artifact** — in `generateFromDossier.ts`, read `kb_doc_refs` for the problem and append a `Sources:` line listing `filename (docType)` to the rendered content + stamp `provenance_by_field.sources = '[C]'`. Keep the existing deterministic render; never invent a number.

- [ ] **Step 5: Run — PASS.**
- [ ] **Step 6: Commit** `feat(p06): ground case answers in KB (semantic B.6.5) + cite source in dossier (§8 provenance)`

---

### Task 9: write-back — accepted dossier grows the base

**Files:** Modify `server/routers/artifact.ts:77-99`; Test `tests/integration/knowledge_writeback.test.ts`

- [ ] **Step 1: Failing test** — approve an artifact, then `searchKnowledge` finds a new `source='accepted_dossier'` doc derived from it.

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement** — inside the `decide` mutation, in the `approve` branch, after the status update + `Artifact_Decision` insert (same transaction is fine; embedding call is async but the row is the source of truth):

```ts
if (input.action === "approve") {
  const a = await query<{ content: string; kind: string }>(
    `select content, kind from gov."Generated_Artifact" where artifact_id=$1 and tenant_id=$2`,
    [input.artifactId, ctx.tenantId],
  );
  if (a[0]?.content) {
    await ingestDocument(ctx.tenantId, {
      filename: `accepted-${input.artifactId}.md`, mime: "text/markdown",
      text: a[0].content, source: "accepted_dossier",
    });
  }
}
```

> Accepted-dossier docs are ingested with `source='accepted_dossier'`; classifier will likely tag them `Runbook`. They become retrievable immediately — the living base the operator described.

- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** `feat(p06): write-back — approved dossier vectorized into KB (living RL base)`

---

### Task 10: NBA tie-in — retrieval informs whether to change the NBA

**Files:** Modify `server/routers/knowledge.ts` (add `nbaImpact`); reuse `shared/contracts.ts` `nbaCockpitRow`; Test `tests/integration/knowledge_nba_impact.test.ts`

> Contract verified [V] this session: `nbaCockpitRow` (shared/contracts.ts:152-165) + `gov."NBA_Proposal"` + `server/agente/nba_engine.ts`. The recommendation is **text + a Decision_Trace**; the AI never moves a number or auto-changes the level (§3.3/§3.6). Human decides on the cockpit.

- [ ] **Step 1: Failing test** — given an NBA proposal for a cohort and a Policy doc that contradicts its current level, `nbaImpact` returns `{ shouldReview: true, evidence: [hits], note }`.

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement `nbaImpact`**

```ts
nbaImpact: tenantProcedure.input(z.object({ nbaId: z.string() })).query(async ({ ctx, input }) => {
  const p = await query<{ root_cause: string | null; action_type: string | null }>(
    `select root_cause, action_type from gov."NBA_Proposal" where nba_id=$1 and tenant_id=$2`,
    [input.nbaId, ctx.tenantId],
  );
  if (!p[0]) return { shouldReview: false, evidence: [], note: null };
  const probe = [p[0].action_type, p[0].root_cause].filter(Boolean).join(" ");
  const hits = await searchKnowledge(ctx.tenantId, probe || "policy", 3);
  const policyHits = hits.filter((h) => h.docType === "Policy" || h.docType === "Terms");
  return {
    shouldReview: policyHits.length > 0,                       // text signal only — human decides (§3.3)
    evidence: policyHits,
    note: policyHits.length ? "Knowledge base has policy/terms relevant to this NBA — review before release." : null,
  };
}),
```

- [ ] **Step 4: Surface on the cockpit** — in the NBA cockpit UI, call `knowledge.nbaImpact` per row; when `shouldReview`, show a non-color-only badge ("Review · KB") + the cited docs in the detail panel. (a11y: redundant text+icon, §4.)
- [ ] **Step 5: Run — PASS.**
- [ ] **Step 6: Commit** `feat(p06): NBA tie-in — KB policy hits flag 'review before release' (text + trace, §3.3)`

---

### Task 11: `/knowledge` screen — upload + confirm-type + list + search tester

**Files:** Create `client/src/pages/KnowledgePage.tsx`, `client/src/features/knowledge/{UploadModal,DocList,SearchTester}.tsx`; Modify `client/src/App.tsx:43-48` + nav.

- [ ] **Step 1: Route + nav** — add `<Route path="/knowledge" component={KnowledgePage} />` (match existing switch) and a "Knowledge" nav link.

- [ ] **Step 2: UploadModal** — file input (`.pdf,.md,.markdown,.txt`), read as base64, call `knowledge.upload`. On result, show the **AI-proposed type** in a confirm step: a `<select>` of the 6 MECE types defaulting to `proposedType`, an explicit "Confirm" button calling `knowledge.confirmType`. a11y: focus-trap + Esc + focus-return + `aria-modal` (reuse the existing modal primitive used by `DossierModal`). `parse_failed` → show the reason, no silent success.

- [ ] **Step 3: DocList** — table of `knowledge.list`: filename, type (with provenance badge `[I]` proposed / `[V]` confirmed), status. Loading/empty/error states explicit (never green-fake, §4).

- [ ] **Step 4: SearchTester** — query box → `knowledge.search` → render hits with filename, docType, similarity, snippet. This is the visible proof of "corre no banco p/ ver se temos essa forma."

- [ ] **Step 5: Visual check** — Playwright screenshot of `/knowledge` (upload → confirm → list → search). Verify against the rendered artifact, not code alone (§5). Tokens `--mxm-*` only, dark-only.

- [ ] **Step 6: Commit** `feat(p06): /knowledge screen — upload, AI-proposed-type confirm, doc list, search tester`

---

### Task 12: anti-fake + a11y + full gate

**Files:** Create `tests/antifake/knowledge_nullprerun.test.ts`, `tests/integration/knowledge_rls.test.ts`, `e2e/knowledge.spec.ts`

- [ ] **Step 1: Anti-fake test** — after `supabase db reset` (seed only), assert `select count(*) from tenant."Knowledge_Chunk"` = 0 and `searchKnowledge(anyPool,...)` = `[]`. No embedding exists until a producer runs (§3.1).
- [ ] **Step 2: RLS test** — ingest in pool A, search pool B → no A docs; confirm the server resolves tenant from context, not input.
- [ ] **Step 3: e2e** — Playwright: upload a fixture `policy.md`, confirm type, run a case on `/diagnosis`, assert the dossier shows the source citation.
- [ ] **Step 4: Run full gate**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:sql && pnpm test:antifake && pnpm test:e2e && pnpm test:a11y`
Expected: all green, with evidence (command + output) — a piece is not done until the gate is green (CLAUDE.md §1/§5).

- [ ] **Step 5: Commit** `test(p06): anti-fake (NULL-pre-run) + RLS isolation + e2e source-citation; gate green`

---

## Self-review (run against this plan)

**Spec coverage** — operator's 5 validated requirements → tasks:
- upload many formats (PDF/MD/…) → Tasks 2, 7, 11 ✅
- AI proposes type, human confirms → Tasks 5, 7 (`confirmType`), 11 ✅
- store in DB + pgvector with provenance of source → Tasks 1, 6 ✅
- every answer first runs the base + cites source → Tasks 8 ✅
- accepted dossier grows the base ("flag") → Task 9 ✅
- NBA tie-in (in v1 per operator) → Task 10 ✅
- dedicated `/knowledge` screen → Task 11 ✅

**Placeholder scan** — no TBD/"handle errors"; parse/classify/search all have concrete fail-closed branches. The three call-sites once flagged are now [V] verified: `query` from `server/db/pool.ts` (`Promise<T[]>`), `router`/`tenantProcedure` from `server/_core/trpc.ts` (ctx exposes `tenantId`), `catalog."Config_Knobs"(key,value,provenance,owner)`. Root router mount = `server/routers/_app.ts` `appRouter` (add `knowledge: knowledgeRouter`).

**Type consistency** — `docType` enum identical across `kb_doc_type` (SQL), `DOC_TYPES` (classify), and `docType` Zod (contracts). `EMBED_DIM=1536` matches `vector(1536)` and `text-embedding-3-small`. `searchHit` shape matches `searchKnowledge` return.

**Open risk flagged honestly:** `OPENAI_API_KEY` is confirmed present in `.env`/`.env.local` [V], so **production uses real `text-embedding-3-small`**. Tests inject `deterministicEmbedder` explicitly (Tasks 6/8) → hermetic, free, and stable regardless of the key being in the environment. The deterministic embedder is non-semantic, so its tests assert exact-text-match retrieval (query == chunk → cosine 1.0), not fuzzy semantic ranking. Real semantic quality is validated manually on `/knowledge` SearchTester with the live key (Task 11) — noted, not hidden (§9).

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-06-20-knowledge-base-rag.md`.
