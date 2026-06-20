import { afterAll, beforeAll, afterEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";
import { proposeNba } from "../../server/agente/nba_engine";
import { ingestDocument } from "../../server/knowledge/store";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";

// P06 Task 10 — NBA tie-in. The knowledge base informs WHETHER a human should review an NBA before
// release: `nbaImpact(nbaId)` loads the proposal, retrieves KB chunks against its action_type +
// root_cause, and if any hit is a Policy/Terms doc it returns shouldReview=true + the cited evidence
// + a note. It is a TEXT signal only (§3.3/§3.6) — it NEVER moves a number or auto-changes the level;
// the human decides on the cockpit. tenant_id is resolved from ctx (server-side, §3.4), never from input,
// and the proposal is gated to the caller's pool via the cohort→snapshot→restaurant chain (no cross-pool leak).
//
// Hermetic: delete OPENAI_API_KEY so retrieval uses the deterministic, key-free embedder
// (exact-text-match: probe == chunk ⇒ cosine ≈ 1.0).

const W1 = "2026-05-25";
const REF = "2026-06-17";

let pool: pg.Pool;
let savedKey: string | undefined;
let tenantId = "";
const createdDocIds: string[] = [];
const createdNbaIds: string[] = [];

function caller(tId = tenantId, userId = "U-KB-NBA") {
  const ctx: Context = {
    session: { user_id: userId, tenant_id: tId, org_level: "team" },
    tenantId: tId,
    userId,
  };
  return appRouter.createCaller(ctx);
}

// Seed a real proposal in the pool (committed — the tRPC procedure reads via the global pool, not a tx).
async function seedProposal(): Promise<{ nbaId: string; actionType: string; rootCause: string }> {
  const r = (
    await pool.query<{ restaurant_id: string; cohort_id: string }>(
      `select cms.restaurant_id, cms.cohort_id
         from cohort."Cohort_Membership_Snapshot" cms
        where cms.week=$1 and cms.m_connection < 0.50 order by cms.restaurant_id limit 1`,
      [W1],
    )
  ).rows[0]!;
  const res = await proposeNba({ restaurantId: r.restaurant_id, cohortId: r.cohort_id, week: W1 });
  createdNbaIds.push(res.nbaId);
  const row = (
    await pool.query<{ action_type: string; root_cause: string }>(
      `select action_type, root_cause from gov."NBA_Proposal" where nba_id=$1`,
      [res.nbaId],
    )
  ).rows[0]!;
  return { nbaId: res.nbaId, actionType: row.action_type, rootCause: row.root_cause };
}

beforeAll(async () => {
  pool = makePool();
  savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY; // → deterministicEmbedder (hermetic, free, stable)
  await resetDb(pool);
  await runP01({ week: W1, refDate: REF });
  tenantId = (await pool.query<{ tenant_id: string }>(`select tenant_id from tenant."Restaurant" limit 1`)).rows[0]!
    .tenant_id;
}, 120_000);

afterEach(async () => {
  if (createdDocIds.length) {
    await pool.query(`delete from tenant."Knowledge_Document" where doc_id = any($1)`, [createdDocIds.splice(0)]);
  }
});

afterAll(async () => {
  // gov.min_calculation / gov.NBA_Proposal are append-only (DELETE is blocked by a trigger); the
  // canonical reset is TRUNCATE (the same path resetDb uses). These pool-committed proposals are this
  // test's own artifacts, so truncate clears them — leaving the shared DB empty again (§14 pre-run state).
  if (createdNbaIds.length) {
    await pool.query(`truncate gov."min_calculation", gov."NBA_Proposal" cascade`);
  }
  if (savedKey !== undefined) process.env.OPENAI_API_KEY = savedKey;
  await pool.end();
});

describe("knowledge.nbaImpact", () => {
  it("flags review when a Policy doc matches the NBA action_type + root_cause", async () => {
    const p = await seedProposal();
    const probe = [p.actionType, p.rootCause].filter(Boolean).join(" ");
    // Ingest a Policy doc whose content is exactly the probe → deterministic embedder yields cosine ≈ 1.0.
    const ing = await ingestDocument(tenantId, {
      filename: "release-policy.md",
      mime: "text/markdown",
      text: probe,
    });
    createdDocIds.push(ing.docId);
    // Confirm it as a Policy so docType filtering accepts it.
    await caller().knowledge.confirmType({ docId: ing.docId, docType: "Policy" });

    const out = await caller().knowledge.nbaImpact({ nbaId: p.nbaId });
    expect(out.shouldReview).toBe(true);
    expect(out.evidence.length).toBeGreaterThan(0);
    expect(out.evidence[0]!.filename).toBe("release-policy.md");
    expect(out.evidence.every((h) => h.docType === "Policy" || h.docType === "Terms")).toBe(true);
    expect(out.note).toBeTruthy();
  });

  it("does NOT flag review when the only KB hit is a non-policy doc type", async () => {
    const p = await seedProposal();
    const probe = [p.actionType, p.rootCause].filter(Boolean).join(" ");
    const ing = await ingestDocument(tenantId, {
      filename: "background.md",
      mime: "text/markdown",
      text: probe,
    });
    createdDocIds.push(ing.docId);
    await caller().knowledge.confirmType({ docId: ing.docId, docType: "Context" });

    const out = await caller().knowledge.nbaImpact({ nbaId: p.nbaId });
    expect(out.shouldReview).toBe(false);
    expect(out.evidence).toEqual([]);
    expect(out.note).toBeNull();
  });

  it("returns no-review fail-closed for an unknown nba_id (never an optimistic default, §3.7)", async () => {
    const out = await caller().knowledge.nbaImpact({ nbaId: "00000000-0000-0000-0000-000000000000" });
    expect(out).toEqual({ shouldReview: false, evidence: [], note: null });
  });

  it("does NOT leak a proposal across pools — a foreign tenant gets no-review (§3.4)", async () => {
    const p = await seedProposal();
    const probe = [p.actionType, p.rootCause].filter(Boolean).join(" ");
    const ing = await ingestDocument("POOL-FOREIGN-NBA", {
      filename: "foreign-policy.md",
      mime: "text/markdown",
      text: probe,
    });
    createdDocIds.push(ing.docId);
    // Foreign pool asks about a proposal that lives in `tenantId`'s pool ⇒ proposal not visible ⇒ no-review.
    const out = await caller("POOL-FOREIGN-NBA").knowledge.nbaImpact({ nbaId: p.nbaId });
    expect(out).toEqual({ shouldReview: false, evidence: [], note: null });
  });
});
