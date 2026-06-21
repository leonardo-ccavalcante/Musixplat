import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool } from "../helpers/db";
import { validateHypothesis } from "../../server/motor/validateHypothesis";
import type { NbaVerdict } from "../../server/agente/reasoning.js";

// 02C:2 — validateHypothesis is the DETERMINISTIC falsifier in the ≤3 loop. `confirmed` is READ from
// the NbaVerdict that SQL fn_nba_test already produced (verdict ∈ {below,above} ∧ gap != null) — NEVER
// recomputed here (§8/§14). `inRange` = the lever's action_code ∈ the cohort tier's
// Policy_Tier.allowed_today.auto_actions (the human-approved range). It does NOT re-implement the
// auto_releasable / money gate — that authority stays in sealMinCalculationNBA + autoDispatch (§3.11).
// Every Policy_Tier row is inserted inside a ROLLED-BACK tx so the table stays pristine pre-run (§14).

let pool: pg.Pool;

beforeAll(() => {
  pool = makePool();
});
afterAll(async () => {
  await pool.end();
});

// A breach lever (verdict 'below' with a real gap) — the only fields validateHypothesis reads.
const breach = (action_code: string): NbaVerdict =>
  ({ action_code, verdict: "below", gap: -0.62 }) as never;

describe("validateHypothesis", () => {
  it("confirmed reads the verdict (out-of-range + real gap) — never recomputes (§8/§14)", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      const real = await validateHypothesis(breach("A1"), "tier-mtest", "pool-A", c);
      expect(real.confirmed).toBe(true);
      const ok = await validateHypothesis({ action_code: "A1", verdict: "ok", gap: null } as never, "tier-mtest", "pool-A", c);
      expect(ok.confirmed).toBe(false);
    } finally {
      await c.query("rollback");
      c.release();
    }
  });

  it("inRange = action_code ∈ allowed_today, read ONLY from a policy signed within the caller's tenant (P1-4 §3.4)", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      // pool-A signs a policy for a SHARED tier; A1/A4 approved, A3 (money) not. The signer must be in-pool.
      await c.query(`insert into gov."User"(user_id, tenant_id, org_level, role) values ('u-mtest-A','pool-A','team','agent_manager_senior')`);
      await c.query(
        `insert into gov."Policy_Tier" (policy_id, tier_id, policy_version, tier_cap, allowed_today, human_signature)
         values ('pol-mtest-A', 'tier-mtest', 'mtest-0.0.1', 'LOW', '{"auto_actions":["A1","A4"]}'::jsonb, 'u-mtest-A')`,
      );

      expect((await validateHypothesis(breach("A1"), "tier-mtest", "pool-A", c)).inRange).toBe(true);
      expect((await validateHypothesis(breach("A3"), "tier-mtest", "pool-A", c)).inRange).toBe(false); // money not approved

      // P1-4: pool-B sees the SAME tier but pool-A's allowed_today must NOT authorize pool-B (cross-pool §3.4).
      expect((await validateHypothesis(breach("A1"), "tier-mtest", "pool-B", c)).inRange).toBe(false);

      // Unknown tier ⇒ fail-closed to inRange=false (§7).
      expect((await validateHypothesis(breach("A1"), "tier-absent", "pool-A", c)).inRange).toBe(false);
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
});
