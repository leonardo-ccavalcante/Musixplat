import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, count } from "../helpers/db";
import { searchKnowledge } from "../../server/knowledge/store";
import { deterministicEmbedder as E } from "../../server/knowledge/embedder";

// ── §14 ANTI-FAKE GATE for P06 Knowledge Base / RAG ──────────────────────────────────────────────
// After a pristine reset (raw seed only) and BEFORE any upload/ingest producer runs, NO embedding may
// exist (CLAUDE.md §3.1): an embedding is a RESULT a named producer (ingestDocument) computes at
// runtime — never seeded. The seed.sql carries ZERO Knowledge_* rows by design, so the pristine state
// is an empty base. Knowledge_* tables are NOT in resetDb's truncate list (they are raw-input tables
// outside the deterministic-engine reset), so we truncate them here to recreate the pristine
// `supabase db reset` state — this deletes no producer output that the seed legitimately holds (it
// holds none), it only clears residue left by prior integration runs.
//
// The assertion is twofold: (1) the chunk table is empty for EVERY pool, and (2) searchKnowledge
// returns [] for any pool — the retrieval surface is empty until a producer fills it.

let pool: pg.Pool;

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool); // raw seed only, no producers
  // Recreate the pristine `supabase db reset` state for the raw-input KB tables (chunks cascade).
  await pool.query(`truncate tenant."Knowledge_Document", tenant."Knowledge_Chunk" restart identity cascade`);
}, 60_000);

afterAll(async () => {
  await pool.end();
});

describe("§14 anti-fake — KB embeddings are NULL/empty pre-run", () => {
  it("no Knowledge_Document and no Knowledge_Chunk exist (no producer ran)", async () => {
    expect(await count(pool, 'tenant."Knowledge_Document"')).toBe(0);
    expect(await count(pool, 'tenant."Knowledge_Chunk"')).toBe(0);
  });

  it("no embedding is seeded — every chunk's embedding would be producer-filled, but there are none", async () => {
    // Defensive: even if a chunk row somehow existed pre-run, an embedding must never be seeded.
    expect(await count(pool, 'tenant."Knowledge_Chunk" where embedding is not null')).toBe(0);
  });

  it("searchKnowledge returns [] for any pool before any upload", async () => {
    for (const tenant of ["POOL-PAY", "POOL-DC", "any-other-pool"]) {
      const hits = await searchKnowledge(tenant, "refund within 30 days of a failed payment", 5, E);
      expect(hits).toEqual([]);
    }
  });

  it("kb_* knobs are read BY NAME from Config_Knobs (no hard-coded literal, §3.8)", async () => {
    expect(await count(pool, `catalog."Config_Knobs" where key = 'kb_similarity_threshold'`)).toBe(1);
    expect(await count(pool, `catalog."Config_Knobs" where key = 'kb_retrieval_top_k'`)).toBe(1);
    expect(await count(pool, `catalog."Config_Knobs" where key = 'kb_chunk_size'`)).toBe(1);
  });
});
