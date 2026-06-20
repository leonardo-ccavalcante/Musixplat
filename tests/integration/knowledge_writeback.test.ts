import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";
import { searchKnowledge } from "../../server/knowledge/store";
import { deterministicEmbedder as E } from "../../server/knowledge/embedder"; // hermetic: no OpenAI, no cost

// P06 Task 9 — write-back: an APPROVED dossier artifact grows the living base. After the human gate
// approves (status + append-only Artifact_Decision), decide() ingests the artifact content as a new
// Knowledge_Document with source='accepted_dossier', which is immediately retrievable (searchKnowledge).
// Hermetic via the deterministic embedder (exact-text match ⇒ cosine 1.0): the test searches with the
// ingested doc's verbatim raw_text, so a top hit is guaranteed regardless of OpenAI.

const T = "POOL-KBW";

function caller(tenantId: string, userId = "U-KBW-OP") {
  const ctx: Context = {
    session: { user_id: userId, tenant_id: tenantId, org_level: "team" },
    tenantId,
    userId,
  };
  return appRouter.createCaller(ctx);
}

let pool: pg.Pool;

async function cleanKb(): Promise<void> {
  // Knowledge tables are NOT in resetDb's truncate list — clean our own pool (chunks cascade).
  await pool.query(`delete from tenant."Knowledge_Document" where tenant_id = $1`, [T]);
}

// Stage a COMPLETE-dossier artifact (mirrors tests/integration/artifact_decide.test.ts setup):
// an operator + an independent AI proposer (4-eyes), failed orders, a resolved Knowledge_Case (the HOW).
async function setup(tenant: string): Promise<string> {
  await pool.query(`
    insert into gov."User"(user_id, tenant_id, org_level, role) values
      ('U-KBW-OP','${tenant}','team','agent_manager_senior'),
      ('${tenant}-AI','${tenant}','team','ai_agent');
    insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone) values
      ('R-KBW-1','${tenant}','long_tail','long_tail', date '2026-01-01','Centro'),
      ('R-KBW-2','${tenant}','long_tail','long_tail', date '2026-01-01','Centro'),
      ('R-KBW-3','${tenant}','long_tail','long_tail', date '2026-01-01','Norte');
    insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone) values
      ('R-KBW-1', current_date, 100, 20, 'failed','Centro'),
      ('R-KBW-2', current_date, 100, 20, 'failed','Centro'),
      ('R-KBW-3', current_date, 100, 20, 'failed','Norte');
    insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent) values
      ('R-KBW-1:C1','R-KBW-1:conv1','${tenant}','R-KBW-1','billing');
    insert into tenant."Knowledge_Case"(tenant_id, area_type, pattern, outcome, resolution, not_resolved_reason, reviewed) values
      ('${tenant}','finance','payment_not_executed','resolved','gateway retry + manual reissue', null, true);
  `);
  const rep = await pool.query<{ problem_id: string }>(`
    insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, conversation_id, criticality, status)
    values ('${tenant}','R-KBW-1','R-KBW-1:conv1','critical','open') returning problem_id;`);
  await caller(tenant).diagnosis.run({ problemId: rep.rows[0]!.problem_id });
  const g = await caller(tenant).artifact.generate({ problemId: rep.rows[0]!.problem_id });
  if (g.status !== "generated") throw new Error("setup: artifact not generated: " + g.status);
  return g.artifact_id;
}

beforeAll(async () => {
  pool = makePool();
}, 60_000);
beforeEach(async () => {
  await resetDb(pool);
  await cleanKb();
});
afterEach(async () => {
  await cleanKb();
});
afterAll(async () => {
  await pool.end();
});

describe("P06 Task 9 — approved dossier grows the living base (write-back)", () => {
  it("approve ⇒ a new source='accepted_dossier' doc is ingested and immediately retrievable", async () => {
    const artifactId = await setup(T);

    // pre: no accepted_dossier doc exists yet (the producer has not run; §14 NULL-pre-run).
    const before = await rows<{ n: number }>(
      pool,
      `select count(*)::int n from tenant."Knowledge_Document" where tenant_id=$1 and source='accepted_dossier'`,
      [T],
    );
    expect(before[0]!.n).toBe(0);

    const res = await caller(T).artifact.decide({ artifactId, action: "approve" });
    expect(res.status).toBe("approved");

    // post: exactly one accepted_dossier doc, named accepted-<artifactId>.md, derived from THIS artifact.
    const doc = await rows<{ doc_id: string; filename: string; raw_text: string; source: string }>(
      pool,
      `select doc_id::text doc_id, filename, raw_text, source
         from tenant."Knowledge_Document" where tenant_id=$1 and source='accepted_dossier'`,
      [T],
    );
    expect(doc).toHaveLength(1);
    expect(doc[0]!.filename).toBe(`accepted-${artifactId}.md`);
    expect(doc[0]!.raw_text.length).toBeGreaterThan(0);

    // immediately retrievable: searching its verbatim text returns it as a hit (hermetic deterministic embedder).
    const hits = await searchKnowledge(T, doc[0]!.raw_text, 5, E);
    expect(hits.some((h) => h.docId === doc[0]!.doc_id)).toBe(true);
  });

  it("reject does NOT grow the base (only approval feeds the living base)", async () => {
    const artifactId = await setup(T);
    await caller(T).artifact.decide({ artifactId, action: "reject" });
    const doc = await rows<{ n: number }>(
      pool,
      `select count(*)::int n from tenant."Knowledge_Document" where tenant_id=$1 and source='accepted_dossier'`,
      [T],
    );
    expect(doc[0]!.n).toBe(0);
  });
});
