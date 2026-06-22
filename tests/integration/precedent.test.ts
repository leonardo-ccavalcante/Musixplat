import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { acceptPrecedent } from "../../server/diagnosis/precedent";
import { deterministicEmbedder } from "../../server/knowledge/embedder";
import type { NbaVerdict } from "../../server/agente/reasoning";

// 05D Part B — the accept-gate (§50/§94): kNN retrieves the nearest VERIFIED-FIXED precedent, and it is
// reused ONLY if its structured lever still re-confirms on the current SQL-produced verdicts. Two gates:
// (a) measured-verified (never a raw 'acted'), (b) the signal re-confirms NOW. Hermetic deterministic embedder.
const TENANT = "POOL-PREC";
let pool: pg.Pool;
const exec = <T extends pg.QueryResultRow>(sql: string, params: readonly unknown[]): Promise<T[]> =>
  pool.query<T>(sql, [...params]).then((r) => r.rows);

const verdict = (action_code: string, v: string, gap: number | null): NbaVerdict => ({
  action_code, dimension: "m_connection", measured: 1, standard: 2, verdict: v, gap,
  within_range: true, n_min_ok: true, k_anon_ok: true,
});

async function seedCase(status: string, actionCode: string, embedText = "m_connection_below"): Promise<void> {
  const [vec] = await deterministicEmbedder.embed([embedText]); // same text the query embeds ⇒ kNN match (sim 1)
  await pool.query(
    `insert into tenant."Knowledge_Case"
       (tenant_id, area_type, pattern, outcome, resolution, reviewed, verification_status, lever, embedding)
     values ($1,'m_connection','m_connection_below','resolved','reset the device',true,$2,$3::jsonb,$4::vector)`,
    [TENANT, status, JSON.stringify({ action_code: actionCode, dimension: "m_connection", verdict: "below" }), `[${vec!.join(",")}]`],
  );
}

beforeAll(async () => { pool = makePool(); }, 60_000);
beforeEach(async () => { await resetDb(pool); });
afterAll(async () => { await pool.end(); });

describe("05D Part B — acceptPrecedent (precedent-first accept-gate)", () => {
  const confirming = [verdict("act_reset", "below", -5)];

  it("ACCEPTS a verified_fixed precedent whose lever re-confirms — acts on the CURRENT verdict", async () => {
    await seedCase("verified_fixed", "act_reset");
    const out = await acceptPrecedent(TENANT, confirming, "m_connection_below", exec, deterministicEmbedder, 0.5);
    expect(out).not.toBeNull();
    expect(out?.resolution).toBe("reset the device");
    expect(out?.freshVerdict.gap).toBe(-5); // the live number, not the stale persisted one (§14)
  });

  it("REJECTS an unverified precedent (kNN only retrieves verified_fixed — never a raw 'acted')", async () => {
    await seedCase("unverified", "act_reset");
    expect(await acceptPrecedent(TENANT, confirming, "m_connection_below", exec, deterministicEmbedder, 0.5)).toBeNull();
  });

  it("REJECTS a verified precedent whose signal NO LONGER re-confirms (verdict is ok now)", async () => {
    await seedCase("verified_fixed", "act_reset");
    const resolved = [verdict("act_reset", "ok", null)];
    expect(await acceptPrecedent(TENANT, resolved, "m_connection_below", exec, deterministicEmbedder, 0.5)).toBeNull();
  });

  it("REJECTS when the precedent's action isn't among the current verdicts", async () => {
    await seedCase("verified_fixed", "act_other");
    expect(await acceptPrecedent(TENANT, confirming, "m_connection_below", exec, deterministicEmbedder, 0.5)).toBeNull();
  });

  it("tenant-scoped: a verified precedent in another pool is never retrieved (§3.4)", async () => {
    await seedCase("verified_fixed", "act_reset");
    expect(await acceptPrecedent("POOL-OTHER", confirming, "m_connection_below", exec, deterministicEmbedder, 0.5)).toBeNull();
  });

  it("REJECTS a verified precedent that is SEMANTICALLY DISSIMILAR (below the similarity floor · Codex)", async () => {
    // The action_code still re-confirms, but the precedent is about a different situation ⇒ its embedding is
    // orthogonal to the query ⇒ below minSim ⇒ NOT reused (no autonomous dispatch of an unrelated resolution).
    await seedCase("verified_fixed", "act_reset", "a completely unrelated billing refund situation");
    expect(await acceptPrecedent(TENANT, confirming, "m_connection_below", exec, deterministicEmbedder, 0.5)).toBeNull();
  });
});
