import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows } from "../helpers/db";
import { ingestDocument } from "../../server/knowledge/store";
import { deterministicEmbedder as E } from "../../server/knowledge/embedder"; // hermetic: no OpenAI, no cost
import { runDiagnosis } from "../../server/diagnosis/orchestrator";
import { computeImpactLedger } from "../../server/diagnosis/impact";
import { generateFromDossier } from "../../server/artifact/generateFromDossier";

// P06 Task 8 — every case answer FIRST runs the knowledge base and CITES the source (operator req).
// The spine (B.6.5) semantically retrieves KB docs into Diagnosed_Problem.kb_doc_refs (provenance [C]),
// and generateFromDossier appends a Sources: line that names the cited filename (provenance sources=[C]).
// Hermetic: the deterministic (non-semantic) embedder yields cosine 1.0 ONLY on exact-text match, so the
// policy doc text is the orchestrator's top hypothesis verbatim ("payment was not executed") — that is the
// finance HYPOTHESES[0], which deterministicReasoning ranks first, making it the B.6.5 probe.

const T = "POOL-KBG";
const POLICY_FILENAME = "refund-policy.md";
const TOP_HYPOTHESIS = "payment was not executed"; // === finance HYPOTHESES[0] (orchestrator probe)

let pool: pg.Pool;

async function cleanKb(): Promise<void> {
  // Knowledge tables are NOT in resetDb's truncate list — clean our own pool (chunks cascade).
  await pool.query(`delete from tenant."Knowledge_Document" where tenant_id = $1`, [T]);
}

// Stage a COMPLETE finance dossier with a HOW (resolved Knowledge_Case) so generateFromDossier persists.
// Mirrors tests/integration/artifact.test.ts stage(): failed orders ⇒ Affected/silent/revenue produced.
async function stageProblem(): Promise<string> {
  await pool.query(`
    insert into gov."User"(user_id, tenant_id, org_level, role)
    values ('${T}-AI','${T}','team','ai_agent');
    insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
    values ('R-KBG-1','${T}','long_tail','long_tail', date '2026-01-01','Centro'),
           ('R-KBG-2','${T}','long_tail','long_tail', date '2026-01-01','Centro'),
           ('R-KBG-3','${T}','long_tail','long_tail', date '2026-01-01','Norte');
    insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
    values ('R-KBG-1', current_date, 100, 20, 'failed','Centro'),
           ('R-KBG-2', current_date, 100, 20, 'failed','Centro'),
           ('R-KBG-3', current_date, 100, 20, 'failed','Norte');
    insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
    values ('R-KBG-1:C1','R-KBG-1:conv1','${T}','R-KBG-1','billing');
    insert into tenant."Knowledge_Case"(tenant_id, area_type, pattern, outcome, resolution, not_resolved_reason, reviewed)
    values ('${T}','finance','payment_not_executed','resolved','gateway retry + manual reissue', null, true);
  `);
  const rep = await pool.query<{ problem_id: string }>(`
    insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, conversation_id, criticality, status)
    values ('${T}','R-KBG-1','R-KBG-1:conv1','critical','open') returning problem_id;`);
  return rep.rows[0]!.problem_id;
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

describe("P06 Task 8 — KB grounds the answer + cites the source", () => {
  it("spine retrieves the uploaded policy into kb_doc_refs ([C]) AND the artifact cites its filename", async () => {
    // 1. upload a refund policy into the pool (chunk + embed = §14 producer fills embeddings).
    await ingestDocument(
      T,
      { filename: POLICY_FILENAME, mime: "text/markdown", text: TOP_HYPOTHESIS, source: "upload" },
      E,
    );

    const problemId = await stageProblem();

    // 2. run the spine on the payment case — B.6.5 semantic retrieval uses the SAME hermetic embedder.
    await runDiagnosis(problemId, T, undefined, E);
    await computeImpactLedger(problemId); // EPIC-B5 f5 quantify (as diagnosis.run does) ⇒ dossier complete.

    // 3a. kb_doc_refs is non-empty AND carries [C] provenance (never seeded — produced by B.6.5).
    const dp = await rows<{ kb_doc_refs: { filename: string }[]; prov: Record<string, string> }>(
      pool,
      `select kb_doc_refs, provenance_by_field as prov
         from tenant."Diagnosed_Problem" where problem_id = $1`,
      [problemId],
    );
    expect(dp[0]!.kb_doc_refs.length).toBeGreaterThan(0);
    expect(dp[0]!.kb_doc_refs.some((r) => r.filename === POLICY_FILENAME)).toBe(true);
    expect(dp[0]!.prov.kb_doc_refs).toBe("[C]");

    // 3b. the generated artifact content references the cited policy filename + stamps sources=[C].
    const res = await generateFromDossier(problemId, T);
    expect(res.status).toBe("generated");

    const a = await rows<{ content: unknown; provenance: Record<string, string> }>(
      pool,
      `select content, provenance from gov."Generated_Artifact" where problem_id = $1`,
      [problemId],
    );
    expect(JSON.stringify(a[0]!.content)).toContain(POLICY_FILENAME);
    expect(a[0]!.provenance.sources).toBe("[C]");
  });
});
