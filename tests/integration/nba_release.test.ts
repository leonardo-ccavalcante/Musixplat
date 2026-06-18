import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";
import { proposeNba } from "../../server/agente/nba_engine";
import { recordRelease } from "../../server/routers/cockpit";

// 02:1C / F-1.2 / BR-1 / BR-9 / BR-LOG-3 — a human releases/pauses a proposal. Writes Release_Batch +
// its Decision_Trace atomically (no-trace-no-action); override only DOWN; 4-eyes proposer(AI) != operator
// (human), human = independent confirmer; cross-pool is invisible. Runs in a ROLLED-BACK tx (§14 antifake).

const W1 = "2026-05-25";
const REF = "2026-06-17";
let pool: pg.Pool;

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
  await runP01({ week: W1, refDate: REF });
}, 120_000);
afterAll(async () => {
  await pool.end();
});

describe("02:1C — human release/pause → Decision_Trace + Release_Batch", () => {
  it("releases down with a linked trace; rejects override-up and cross-pool", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      // A problem restaurant in POOL-001 (the human operator U-OP-001 governs this pool).
      const r = (
        await c.query<{ restaurant_id: string; cohort_id: string; tier_base: string }>(
          `select cms.restaurant_id, cms.cohort_id, ct.tier_base
           from cohort."Cohort_Membership_Snapshot" cms
           join cohort."Cohort" ct on ct.cohort_id=cms.cohort_id and ct.cohort_rule_version=cms.cohort_rule_version
           join tenant."Restaurant" rr on rr.restaurant_id=cms.restaurant_id and rr.tenant_id='POOL-001'
           where cms.week=$1 and cms.m_connection < 0.50 order by cms.restaurant_id limit 1`,
          [W1],
        )
      ).rows[0]!;
      const intent = (await c.query<{ intent_id: string }>(`select intent_id from catalog."Intent_Catalog" limit 1`))
        .rows[0]!.intent_id;
      await c.query(
        `insert into gov."Policy_Tier"(policy_id, tier_id, policy_version, tier_cap) values ('pt-rel', $1, 'pv-rel', 'MEDIUM')`,
        [r.tier_base],
      );
      await c.query(
        `insert into gov."Eval_Cell"(cohort_id, intent, version, released_evals, status) values ($1, $2, 'v1', 'LOW', 'green')`,
        [r.cohort_id, intent],
      );
      const res = await proposeNba({ restaurantId: r.restaurant_id, cohortId: r.cohort_id, week: W1 }, undefined, c);

      // Human releases at LOW (effective_level is LOW ⇒ override-down OK).
      const out = await recordRelease(
        { tenantId: "POOL-001", operatorId: "U-OP-001", nbaId: res.nbaId, action: "RELEASE", resultingLevel: "LOW" },
        c,
      );
      expect(out.effectiveLevel).toBe("LOW");

      const rb = (
        await c.query<{
          proposer_id: string;
          operator_id: string;
          action: string;
          resulting_level: string;
          decision_trace_id: string | null;
        }>(`select proposer_id, operator_id, action, resulting_level, decision_trace_id from gov."Release_Batch" where release_id=$1`, [
          out.releaseId,
        ])
      ).rows[0]!;
      expect(rb.proposer_id).toBe("U-AI-001"); // the AI proposed
      expect(rb.operator_id).toBe("U-OP-001"); // the human signed (4-eyes: distinct)
      expect(rb.action).toBe("RELEASE");
      expect(rb.resulting_level).toBe("LOW");
      expect(rb.decision_trace_id).toBe(out.traceId); // 1-1 link set

      const dt = (
        await c.query<{
          release_id: string;
          action: string;
          proposer_id: string;
          confirmer_id: string | null;
          effective_level_applied: string;
          policy_version: string;
          independence_guaranteed: boolean;
        }>(
          `select release_id, action, proposer_id, confirmer_id, effective_level_applied, policy_version, independence_guaranteed
           from gov."Decision_Trace" where trace_id=$1`,
          [out.traceId],
        )
      ).rows[0]!;
      expect(dt.release_id).toBe(out.releaseId);
      expect(dt.action).toBe("release");
      expect(dt.proposer_id).toBe("U-AI-001");
      expect(dt.confirmer_id).toBe("U-OP-001"); // human confirms ⇒ independent
      expect(dt.effective_level_applied).toBe("LOW");
      expect(dt.policy_version).toBe("pv-rel");
      expect(dt.independence_guaranteed).toBe(true);

      // Override UP is rejected (BR-1 / AUT-11): resulting_level must be <= effective_level (LOW).
      await expect(
        recordRelease(
          { tenantId: "POOL-001", operatorId: "U-OP-001", nbaId: res.nbaId, action: "RELEASE", resultingLevel: "HIGH" },
          c,
        ),
      ).rejects.toThrow(/override only down/);

      // Pool isolation: a pool with NO restaurant in this (market-aggregated) cohort cannot touch it.
      // Cohorts span pools by design (04 §3.2) so a real pool usually has presence; the guard blocks a
      // pool with ZERO presence (and any unknown pool). Finer cross-tenant insight is k-anon-suppressed
      // upstream, not here.
      await expect(
        recordRelease(
          { tenantId: "POOL-404", operatorId: "U-OP-002", nbaId: res.nbaId, action: "PAUSE", resultingLevel: "LOW" },
          c,
        ),
      ).rejects.toThrow(/not in this pool/);
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
});
