import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows, count } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";

// P01 deterministic producers (F-1.1/1.2/1.3/1.3b/1.4/1.7/1.8/2.2/2.6/4.3/5.3/5.4).
// All against the local docker db via direct pg (health-independent).

const W1 = "2026-05-25";
const W2 = "2026-06-15";
const REF = "2026-06-17";

let pool: pg.Pool;
beforeAll(() => {
  pool = makePool();
});
afterAll(async () => {
  await pool.end();
});

async function inTx(fn: (c: pg.PoolClient) => Promise<void>): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await fn(c);
  } finally {
    await c.query("rollback");
    c.release();
  }
}

describe("F-1.1 assignment + F-1.2 ranking", () => {
  it("links every active restaurant, stamps version, computes tenure/percentile from brutos", async () => {
    await resetDb(pool);
    // pre-run: results NULL (anti-fake within the flow)
    expect(await count(pool, 'cohort."Cohort_Membership_Snapshot"')).toBe(0);
    await runP01({ week: W1, refDate: REF });

    expect(await count(pool, 'tenant."Restaurant" where tenure_months is null')).toBe(0);
    expect(await count(pool, 'cohort."Cohort_Membership_Snapshot"')).toBe(5000);
    // every membership stamped with the vigente version
    expect(
      await count(pool, `cohort."Cohort_Membership_Snapshot" where cohort_rule_version <> 'v1'`),
    ).toBe(0);
    // percentile computed (non-null) for accounts in viable cells
    expect(
      await count(pool, "cohort.\"Cohort_Membership_Snapshot\" where percentile_in_cohort is not null"),
    ).toBeGreaterThan(0);
    // n_accounts computed per cell
    expect(await count(pool, 'cohort."Cohort" where n_accounts is not null')).toBeGreaterThan(0);
  });

  it("is deterministic — two fresh runs give identical percentile/gap", async () => {
    await resetDb(pool);
    await runP01({ week: W1, refDate: REF });
    const a = await rows<{ restaurant_id: string; p: string; g: string }>(
      pool,
      `select restaurant_id, coalesce(percentile_in_cohort::text,'-') p, coalesce(gap_to_top::text,'-') g
       from cohort."Cohort_Membership_Snapshot" where week = $1 order by restaurant_id`,
      [W1],
    );
    await resetDb(pool);
    await runP01({ week: W1, refDate: REF });
    const b = await rows<{ restaurant_id: string; p: string; g: string }>(
      pool,
      `select restaurant_id, coalesce(percentile_in_cohort::text,'-') p, coalesce(gap_to_top::text,'-') g
       from cohort."Cohort_Membership_Snapshot" where week = $1 order by restaurant_id`,
      [W1],
    );
    expect(b).toEqual(a);
  });

  it("F-5.3 — re-running the same week does not duplicate (UNIQUE)", async () => {
    await resetDb(pool);
    await runP01({ week: W1, refDate: REF });
    const before = await count(pool, `cohort."Cohort_Membership_Snapshot" where week = '${W1}'`);
    await runP01({ week: W1, refDate: REF });
    const after = await count(pool, `cohort."Cohort_Membership_Snapshot" where week = '${W1}'`);
    expect(after).toBe(before);
  });
});

describe("F-1.3 n_min gate (significance) — boundary, SEPARATE fixture from k-anon", () => {
  it("collapses below n_min(20); ok at/above", async () => {
    await resetDb(pool); // clean cohort table so the fixture tuple is unique
    for (const [n, expected] of [
      [19, true],
      [20, false],
      [21, false],
    ] as const) {
      await inTx(async (c) => {
        await c.query(
          `insert into cohort."Cohort"(cohort_id, tenure_bucket, tier_base, cohort_rule_version, n_accounts)
           values ('t_nmin','0-3m','long_tail','v1',$1)`,
          [n],
        );
        await c.query("select cohort.fn_gate_n_min($1)", [W1]);
        const r = await c.query<{ collapsed: boolean }>(
          `select collapsed from cohort."Cohort" where cohort_id='t_nmin'`,
        );
        expect(r.rows[0]?.collapsed).toBe(expected);
      });
    }
  });
});

describe("F-1.3b k-anon gate (re-identification) — boundary, SEPARATE fixture from n_min", () => {
  it("suppresses below k(5); passes at/above; fail-closed on NULL count", async () => {
    await resetDb(pool); // clean cohort table so the fixture tuple is unique
    for (const [n, expected] of [
      [4, true],
      [5, false],
      [6, false],
    ] as const) {
      await inTx(async (c) => {
        await c.query(
          `insert into cohort."Cohort"(cohort_id, tenure_bucket, tier_base, cohort_rule_version, n_accounts)
           values ('t_kanon','0-3m','long_tail','v1',$1)`,
          [n],
        );
        await c.query("select cohort.fn_gate_k_anon()");
        const r = await c.query<{ s: boolean }>(
          `select k_suppression_applied s from cohort."Cohort" where cohort_id='t_kanon'`,
        );
        expect(r.rows[0]?.s).toBe(expected);
      });
    }
    // fail-closed: indeterminate (NULL) count ⇒ suppress
    await inTx(async (c) => {
      await c.query(
        `insert into cohort."Cohort"(cohort_id, tenure_bucket, tier_base, cohort_rule_version)
         values ('t_kanon_null','0-3m','long_tail','v1')`,
      );
      await c.query("select cohort.fn_gate_k_anon()");
      const r = await c.query<{ s: boolean }>(
        `select k_suppression_applied s from cohort."Cohort" where cohort_id='t_kanon_null'`,
      );
      expect(r.rows[0]?.s).toBe(true);
    });
  });
});

describe("F-2.2 diff + F-4.3 anti-mezcla", () => {
  it("produces delta_status from the allowed enum across two weeks (same version only)", async () => {
    await resetDb(pool);
    await runP01({ week: W1, refDate: REF });
    await runP01({ week: W2, refDate: REF, prevSemana: W1 });
    const events = await count(pool, `cohort."Prioritized_NBA_Event" where week='${W2}'`);
    expect(events).toBeGreaterThan(0);
    // every event carries a valid delta_status and the vigente version
    expect(
      await count(
        pool,
        `cohort."Prioritized_NBA_Event" where week='${W2}' and (delta_status is null or cohort_rule_version<>'v1')`,
      ),
    ).toBe(0);
    // F-2.6 movement log appended (append-only Usage_Event)
    expect(await count(pool, `tenant."Usage_Event" where event_type='movement'`)).toBeGreaterThan(0);
  });

  it("F-4.3 guard: same version passes, mixed versions raise (fail-closed)", async () => {
    const ok = await rows(pool, "select cohort.fn_assert_single_version(array['v1','v1']) as r");
    expect(ok).toHaveLength(1);
    await expect(
      pool.query("select cohort.fn_assert_single_version(array['v1','v0'])"),
    ).rejects.toThrow(/anti-mezcla/);
  });
});
