import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";

// P06 Task 7 — knowledge tRPC router (upload / confirmType / search / list), tenant-scoped.
// Hermetic: force the deterministic, key-free embedder so retrieval is exact-text-match (query == chunk).
// tenant_id is resolved from ctx (server-side, §3.4) — never from the input body.
const POOL = "POOL-KB-ROUTER";
const OTHER = "POOL-KB-OTHER";

function caller(tenantId = POOL, userId = "U-KB-OP") {
  const ctx: Context = {
    session: { user_id: userId, tenant_id: tenantId, org_level: "team" },
    tenantId,
    userId,
  };
  return appRouter.createCaller(ctx);
}

const b64 = (s: string) => Buffer.from(s, "utf-8").toString("base64");

let pool: pg.Pool;
let savedKey: string | undefined;

beforeAll(async () => {
  pool = makePool();
  savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY; // → deterministicEmbedder (hermetic, free, stable)
}, 60_000);

afterAll(async () => {
  if (savedKey !== undefined) process.env.OPENAI_API_KEY = savedKey;
  await pool.end();
});

beforeEach(async () => {
  await resetDb(pool);
  // Knowledge_* tables are not part of resetDb's truncate set — clear our pools explicitly.
  await pool.query(`delete from tenant."Knowledge_Document" where tenant_id = any($1)`, [[POOL, OTHER]]);
});

describe("knowledge router", () => {
  it("upload happy-path: parses, ingests, AI proposes a type, status=proposed", async () => {
    const r = await caller().knowledge.upload({
      filename: "refund-policy.md",
      mime: "text/markdown",
      contentBase64: b64("# Refund Policy\nRefunds are issued within 14 days of a failed payment."),
    });
    expect(r.status).toBe("proposed");
    expect(r.docId).toBeTruthy();
    expect(r.reason).toBeNull();
    expect(typeof r.proposedType).toBe("string");
    // a chunk (embedding) was produced by the named producer — not seeded (§14).
    const chunks = await rows<{ n: string }>(
      pool,
      `select count(*)::text n from tenant."Knowledge_Chunk" where doc_id=$1`,
      [r.docId],
    );
    expect(Number(chunks[0]!.n)).toBeGreaterThan(0);
  });

  it("upload fail-closed: unsupported mime → parse_failed row + reason, no silent success", async () => {
    const r = await caller().knowledge.upload({
      filename: "x.bin",
      mime: "application/octet-stream",
      contentBase64: b64("anything"),
    });
    expect(r.status).toBe("parse_failed");
    expect(r.reason).toMatch(/unsupported_mime/);
    const doc = await rows<{ status: string }>(
      pool,
      `select status from tenant."Knowledge_Document" where doc_id=$1 and tenant_id=$2`,
      [r.docId, POOL],
    );
    expect(doc[0]?.status).toBe("parse_failed");
  });

  it("confirmType: sets doc_type + status=confirmed + provenance doc_type=[V]", async () => {
    const up = await caller().knowledge.upload({
      filename: "terms.txt",
      mime: "text/plain",
      contentBase64: b64("These are the terms of service for the platform."),
    });
    const res = await caller().knowledge.confirmType({ docId: up.docId, docType: "Terms" });
    expect(res.ok).toBe(true);
    const doc = await rows<{ doc_type: string; status: string; provenance_by_field: { doc_type?: string } }>(
      pool,
      `select doc_type, status, provenance_by_field from tenant."Knowledge_Document" where doc_id=$1 and tenant_id=$2`,
      [up.docId, POOL],
    );
    expect(doc[0]?.doc_type).toBe("Terms");
    expect(doc[0]?.status).toBe("confirmed");
    expect(doc[0]?.provenance_by_field.doc_type).toBe("[V]");
  });

  it("search returns hits for ingested content (exact-text-match under the deterministic embedder)", async () => {
    const text = "Drivers must wear a uniform during every delivery shift.";
    await caller().knowledge.upload({ filename: "rule.md", mime: "text/markdown", contentBase64: b64(text) });
    const r = await caller().knowledge.search({ query: text });
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.hits[0]!.filename).toBe("rule.md");
    expect(r.hits[0]!.similarity).toBeGreaterThan(0.99);
  });

  it("list returns the tenant's docs newest first", async () => {
    await caller().knowledge.upload({ filename: "a.txt", mime: "text/plain", contentBase64: b64("alpha doc") });
    await caller().knowledge.upload({ filename: "b.txt", mime: "text/plain", contentBase64: b64("beta doc") });
    const list = await caller().knowledge.list();
    expect(list.length).toBe(2);
    expect(list[0]!.filename).toBe("b.txt"); // newest first
    expect(list[1]!.filename).toBe("a.txt");
  });

  it("tenant isolation: list/search never cross pools (tenant resolved from ctx, §3.4)", async () => {
    await caller(POOL).knowledge.upload({ filename: "mine.txt", mime: "text/plain", contentBase64: b64("private to pool A") });
    const otherList = await caller(OTHER).knowledge.list();
    expect(otherList.length).toBe(0);
    const otherSearch = await caller(OTHER).knowledge.search({ query: "private to pool A" });
    expect(otherSearch.hits.length).toBe(0);
  });
});
