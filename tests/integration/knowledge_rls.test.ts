import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";
import { ingestDocument, searchKnowledge } from "../../server/knowledge/store";
import { deterministicEmbedder as E } from "../../server/knowledge/embedder";

// ── §3.4 RLS single-pool isolation for P06 ───────────────────────────────────────────────────────
// tenant_id is the pool frontier. It is resolved SERVER-SIDE from the signed session (ctx.tenantId),
// never from the request body. A document uploaded in pool A must be invisible to pool B's search/list,
// and a pool-B caller must NOT be able to reach pool-A data by smuggling a tenant hint in the input.
//
// Hermetic: VITEST=1 forces the deterministic, key-free embedder inside resolveEmbedder, so the router
// path (which injects no embedder) still runs offline. We query with the EXACT chunk text so the
// retrieval scores ≈ 1.0 — if the server-side `where tenant_id = $1` scoping ever regressed, pool B
// would surface pool A's chunk as a top hit and these assertions would fail (non-vacuous, mirrors the
// round-trip leak guard).
const POOL_A = "POOL-RLS-A";
const POOL_B = "POOL-RLS-B";
const SECRET = "Refunds are issued within 30 days of a failed payment in pool A only.";

function caller(tenantId: string, userId = "U-RLS-OP") {
  const ctx: Context = {
    session: { user_id: userId, tenant_id: tenantId, org_level: "team" },
    tenantId,
    userId,
  };
  return appRouter.createCaller(ctx);
}

const b64 = (s: string) => Buffer.from(s, "utf-8").toString("base64");

let pool: pg.Pool;

async function clean(): Promise<void> {
  await pool.query(`delete from tenant."Knowledge_Document" where tenant_id = any($1)`, [[POOL_A, POOL_B]]);
}

beforeAll(async () => {
  pool = makePool();
  await clean();
}, 60_000);

afterAll(async () => {
  await clean();
  await pool.end();
});

describe("§3.4 knowledge RLS isolation — tenant from ctx, not input", () => {
  it("a doc uploaded in pool A is invisible to pool B's list and search", async () => {
    const up = await caller(POOL_A).knowledge.upload({
      filename: "pool-a-policy.md",
      mime: "text/markdown",
      contentBase64: b64(SECRET),
    });
    expect(up.status).toBe("proposed");

    // Pool B sees nothing — neither in its document list nor via semantic search on the exact text.
    const bList = await caller(POOL_B).knowledge.list();
    expect(bList.find((d) => d.filename === "pool-a-policy.md")).toBeUndefined();

    const bSearch = await caller(POOL_B).knowledge.search({ query: SECRET });
    expect(bSearch.hits.find((h) => h.filename === "pool-a-policy.md")).toBeUndefined();

    // Pool A still sees its own doc (proves the search itself is non-vacuous — it CAN find the chunk
    // when the scope matches, so pool B's empty result is real isolation, not a dead query).
    const aSearch = await caller(POOL_A).knowledge.search({ query: SECRET });
    expect(aSearch.hits.find((h) => h.filename === "pool-a-policy.md")).toBeDefined();
  });

  it("the tenant is taken from ctx — two callers with the SAME input land in different pools", async () => {
    // Both callers send the identical input body; only ctx.tenantId differs. If the server ever read a
    // tenant from the body, this separation would collapse. The upload contract has no tenant field at
    // all (shared/contracts_knowledge.ts), so a client physically cannot name a pool — this asserts the
    // guarantee end-to-end through the router.
    const sameInput = { filename: "shared-name.txt", mime: "text/plain", contentBase64: b64("ctx decides the pool") };
    await caller(POOL_A).knowledge.upload(sameInput);
    await caller(POOL_B).knowledge.upload(sameInput);

    const aDocs = await rowsOf(POOL_A);
    const bDocs = await rowsOf(POOL_B);
    expect(aDocs).toBe(1); // exactly the A copy (plus the earlier pool-a-policy handled in clean order)
    expect(bDocs).toBe(1); // exactly the B copy — never both in one pool
  });

  it("store-level guard: ingest in A, search B with exact text → no A chunk (§3.4)", async () => {
    await ingestDocument(POOL_A, { filename: "store-a.md", mime: "text/markdown", text: SECRET }, E);
    const leaked = await searchKnowledge(POOL_B, SECRET, 5, E);
    expect(leaked.find((h) => h.filename === "store-a.md")).toBeUndefined();
    const found = await searchKnowledge(POOL_A, SECRET, 5, E);
    expect(found.find((h) => h.filename === "store-a.md")).toBeDefined();
  });
});

async function rowsOf(tenantId: string): Promise<number> {
  const r = await pool.query<{ n: string }>(
    `select count(*)::text n from tenant."Knowledge_Document" where tenant_id=$1 and filename='shared-name.txt'`,
    [tenantId],
  );
  return Number(r.rows[0]?.n ?? "0");
}
