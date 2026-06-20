import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool } from "../helpers/db";
import { searchKnowledge, ingestDocument } from "../../server/knowledge/store";
import { deterministicEmbedder as E } from "../../server/knowledge/embedder"; // hermetic: no OpenAI call, no cost

// P06 round-trip: ingest (chunk+embed = §14 producer) → cosine search retrieves the doc, tenant-scoped.
// The deterministic embedder makes the run hermetic + free + reproducible: querying with the exact
// chunk text yields cosine similarity 1.0, so the seeded doc is the top hit.
const T = "pool-test-kb";
const OTHER = "pool-other-kb";

let pool: pg.Pool;

async function clean(): Promise<void> {
  // Knowledge tables are NOT in resetDb's truncate list — clean our own test pools (chunks cascade).
  await pool.query(`delete from tenant."Knowledge_Document" where tenant_id = any($1)`, [[T, OTHER]]);
}

beforeAll(async () => {
  pool = makePool();
  await clean();
});
afterAll(async () => {
  await clean();
  await pool.end();
});

describe("knowledge round-trip", () => {
  it("returns no hits before any upload (§14 NULL-pre-run)", async () => {
    const r = await searchKnowledge(T, "refund", 5, E);
    expect(r).toEqual([]);
  });

  it("ingests then retrieves the doc as a cited hit", async () => {
    await ingestDocument(
      T,
      {
        filename: "policy.md",
        mime: "text/markdown",
        text: "Refunds are issued within 30 days of a failed payment.",
      },
      E,
    );
    const hits = await searchKnowledge(
      T,
      "Refunds are issued within 30 days of a failed payment.",
      5,
      E,
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.filename).toBe("policy.md");
    expect(hits[0]!.similarity).toBeGreaterThan(0.99); // exact-text query ⇒ cosine ≈ 1.0
  });

  it("does NOT leak another pool's docs (§3.4 RLS)", async () => {
    const hits = await searchKnowledge(OTHER, "refund", 5, E);
    expect(hits.find((h) => h.filename === "policy.md")).toBeUndefined();
  });
});
