import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool } from "../helpers/db";
import { ingestDocument } from "../../server/knowledge/store";
import type { Embedder } from "../../server/knowledge/embedder";

// P06 atomicity (the operator's rule: "se o embed falhar, não colocar lixo no DB"). ingestDocument
// does all the fallible work (classify → chunk → embed) BEFORE any write, then writes the document and
// every chunk in one transaction. So a terminal embed failure leaves the base with ZERO rows — no
// document with zero chunks, nothing to clean up before a retry (§3.7 fail-closed).
const T = "pool-atomic-kb";
let pool: pg.Pool;
const clean = (): Promise<unknown> =>
  pool.query(`delete from tenant."Knowledge_Document" where tenant_id = $1`, [T]);

// A terminal failure (401 = bad key): embedWithRetry surfaces it at once, no retries.
const exploding: Embedder = {
  async embed() {
    throw Object.assign(new Error("embed boom"), { status: 401 });
  },
};

beforeAll(async () => {
  pool = makePool();
  await clean();
});
afterAll(async () => {
  await clean();
  await pool.end();
});

describe("ingestDocument atomicity", () => {
  it("writes NOTHING when embedding fails — no orphan document, no chunks", async () => {
    await expect(
      ingestDocument(T, { filename: "x.md", mime: "text/markdown", text: "some policy text" }, exploding),
    ).rejects.toBeTruthy();

    const docs = await pool.query<{ n: number }>(
      `select count(*)::int n from tenant."Knowledge_Document" where tenant_id = $1`,
      [T],
    );
    const chunks = await pool.query<{ n: number }>(
      `select count(*)::int n from tenant."Knowledge_Chunk" where tenant_id = $1`,
      [T],
    );
    expect(docs.rows[0]!.n).toBe(0); // no half-written document
    expect(chunks.rows[0]!.n).toBe(0);
  });
});
