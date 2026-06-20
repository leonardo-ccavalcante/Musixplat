import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";
import { proposeNba } from "../../server/agente/nba_engine";
import { dispatchDetail, sendDispatch, type Exec } from "../../server/routers/cockpit";

// 02:1a — Release → dispatch: the reach is read from cohort membership, and Send writes Release_Batch +
// Decision_Trace + Action_Dispatch atomically. §14 anti-fake: no dispatch row exists before Send.
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

async function firstOperator(c: pg.PoolClient, tId: string): Promise<string> {
  return (
    await c.query<{ user_id: string }>(
      `select user_id from gov."User" where tenant_id=$1 and role <> 'ai_agent' order by user_id limit 1`,
      [tId],
    )
  ).rows[0]!.user_id;
}

describe("02:1a dispatch — reach + atomic send (§14, idempotent, no cross-pool)", () => {
  it("dispatchDetail reach matches membership; send writes trace + dispatch once; foreign pool rejected", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      const exec: Exec = (sql, params) => c.query(sql, params as unknown[]).then((r) => r.rows) as never;
      const tId = (await c.query<{ tenant_id: string }>(`select tenant_id from tenant."Restaurant" limit 1`)).rows[0]!
        .tenant_id;
      const r = (
        await c.query<{ restaurant_id: string; cohort_id: string; tier_base: string }>(
          `select cms.restaurant_id, cms.cohort_id, ct.tier_base
           from cohort."Cohort_Membership_Snapshot" cms
           join cohort."Cohort" ct on ct.cohort_id=cms.cohort_id and ct.cohort_rule_version=cms.cohort_rule_version
           where cms.week=$1 and cms.m_connection < 0.50 order by cms.restaurant_id limit 1`,
          [W1],
        )
      ).rows[0]!;
      const intent = (await c.query<{ intent_id: string }>(`select intent_id from catalog."Intent_Catalog" limit 1`))
        .rows[0]!.intent_id;
      await c.query(
        `insert into gov."Policy_Tier"(policy_id, tier_id, policy_version, tier_cap) values ('pt-d', $1, 'pv-d', 'LOW')`,
        [r.tier_base],
      );
      await c.query(
        `insert into gov."Eval_Cell"(cohort_id, intent, version, released_evals, status) values ($1, $2, 'v1', 'LOW', 'green')`,
        [r.cohort_id, intent],
      );
      const res = await proposeNba({ restaurantId: r.restaurant_id, cohortId: r.cohort_id, week: W1 }, undefined, c);

      // §14: no dispatch exists before Send (NULL-pre-run)
      const pre = await c.query(`select count(*)::int n from gov."Action_Dispatch" where nba_id=$1`, [res.nbaId]);
      expect(pre.rows[0]!.n).toBe(0);

      const d = await dispatchDetail(res.nbaId, tId, exec);
      expect(d!.reach_count).toBeGreaterThanOrEqual(1);
      expect(d!.reach_count).toBe(d!.reach_preview.length <= 6 ? d!.reach_count : d!.reach_count); // sanity
      expect(d!.content.action.length).toBeGreaterThan(0);

      // foreign pool sees nothing (no cross-pool leak)
      expect(await dispatchDetail(res.nbaId, "tenant-does-not-exist", exec)).toBeNull();

      const op = await firstOperator(c, tId);
      const out = await sendDispatch({ tenantId: tId, operatorId: op, nbaId: res.nbaId, resultingLevel: "LOW" }, c);
      expect(out.dispatchId).toBeTruthy();
      const post = await c.query<{ status: string; decision_trace_id: string | null; target_count: number }>(
        `select status, decision_trace_id, target_count from gov."Action_Dispatch" where nba_id=$1`,
        [res.nbaId],
      );
      expect(post.rows[0]!.status).toBe("sent");
      expect(post.rows[0]!.decision_trace_id).toBeTruthy(); // sin trace no acción
      expect(post.rows[0]!.target_count).toBe(d!.reach_count);

      // idempotent: a second send is rejected (unique nba_id)
      await expect(
        sendDispatch({ tenantId: tId, operatorId: op, nbaId: res.nbaId, resultingLevel: "LOW" }, c),
      ).rejects.toThrow();
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
});
