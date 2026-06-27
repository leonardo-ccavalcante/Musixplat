import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";
import { proposeNba } from "../../server/agente/nba_engine";
import { recordRelease } from "../../server/routers/cockpit";

// 02:BR-LOG-2 — the signature-quality producer (gov.fn_signature_quality) wired into the human-signed
// writer recordRelease. A desktop release computes Decision_Trace.time_to_signature_sec (= now −
// NBA_Proposal.created_at) and rubber_stamp_flag (= that gap < knob rubber_stamp_max_sec AND a human
// channel). This proves the two RESULT columns flip from NULL→computed (§14) and that the umbral knob
// actually gates through the REAL writer path: a fast sign is flagged, a slow one is not. Rolled-back tx.

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

describe("02:BR-LOG-2 — signature-quality columns computed by the human-signed writer", () => {
  it("desktop release computes time_to_signature_sec; umbral gates rubber_stamp_flag (fast=true, slow=false)", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      // A problem restaurant in POOL-001 the human operator U-OP-001 governs (mirrors nba_release fixture).
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
        `insert into gov."Policy_Tier"(policy_id, tier_id, policy_version, tier_cap) values ('pt-sq', $1, 'pv-sq', 'MEDIUM')`,
        [r.tier_base],
      );
      await c.query(
        `insert into gov."Eval_Cell"(cohort_id, intent, version, released_evals, status) values ($1, $2, 'v1', 'LOW', 'green')`,
        [r.cohort_id, intent],
      );
      const res = await proposeNba({ restaurantId: r.restaurant_id, cohortId: r.cohort_id, week: W1 }, undefined, c);

      // ── FAST sign: backdate the proposal 5s; a desktop release < 30s ⇒ flagged rubber-stamp. ──
      await c.query(`update gov."NBA_Proposal" set created_at = now() - interval '5 seconds' where nba_id = $1::uuid`, [
        res.nbaId,
      ]);
      const fast = await recordRelease(
        { tenantId: "POOL-001", operatorId: "U-OP-001", nbaId: res.nbaId, action: "RELEASE", resultingLevel: "LOW" },
        c,
      );
      const fastDt = (
        await c.query<{ time_to_signature_sec: number | null; rubber_stamp_flag: boolean | null }>(
          `select time_to_signature_sec, rubber_stamp_flag from gov."Decision_Trace" where trace_id = $1`,
          [fast.traceId],
        )
      ).rows[0]!;
      expect(fastDt.time_to_signature_sec).not.toBeNull(); // flipped NULL→computed (§14)
      expect(fastDt.time_to_signature_sec).toBeGreaterThanOrEqual(4);
      expect(fastDt.time_to_signature_sec).toBeLessThan(30);
      expect(fastDt.rubber_stamp_flag).toBe(true); // fast desktop sign (< umbral) ⇒ rubber-stamp

      // ── SLOW sign: backdate the same proposal 120s; a desktop release ≥ 30s ⇒ NOT flagged. ──
      await c.query(`update gov."NBA_Proposal" set created_at = now() - interval '120 seconds' where nba_id = $1::uuid`, [
        res.nbaId,
      ]);
      const slow = await recordRelease(
        { tenantId: "POOL-001", operatorId: "U-OP-001", nbaId: res.nbaId, action: "RELEASE", resultingLevel: "LOW" },
        c,
      );
      const slowDt = (
        await c.query<{ time_to_signature_sec: number | null; rubber_stamp_flag: boolean | null }>(
          `select time_to_signature_sec, rubber_stamp_flag from gov."Decision_Trace" where trace_id = $1`,
          [slow.traceId],
        )
      ).rows[0]!;
      expect(slowDt.time_to_signature_sec).toBeGreaterThanOrEqual(119);
      expect(slowDt.rubber_stamp_flag).toBe(false); // slow sign (≥ umbral) ⇒ not a rubber-stamp
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
});
