import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows, count } from "../helpers/db";

// 02:NBA-CAT — the closed NBA_Catalogo (A1-A8 + no-act) the Autonomy Cockpit's node 1A reads.
// Reference data (seeded like Intent_Catalog), NOT a §14 result. The AI only INSTANCES these codes,
// never invents one (workflow §1A). Money gate (BR-2 / §3.3): financial_class='direct' (A3,A7) ⇒ the
// money step never auto-releases. Every threshold is a Config_Knobs name (§3.8), never a literal.

let pool: pg.Pool;
beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
}, 60_000);
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

describe("02:NBA-CAT — closed NBA catalog (A1-A8 + no-act)", () => {
  it("seeds exactly 8 codes A1-A8 (reference data, present after seed)", async () => {
    expect(await count(pool, 'catalog."NBA_Catalogo"')).toBe(8);
    const codes = (
      await rows<{ code: string }>(pool, `select code from catalog."NBA_Catalogo" order by code`)
    ).map((r) => r.code);
    expect(codes).toEqual(["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"]);
  });

  it("BR-2/§3.3 money gate: exactly A3 + A7 are financial_class='direct'", async () => {
    const direct = (
      await rows<{ code: string }>(
        pool,
        `select code from catalog."NBA_Catalogo" where financial_class = 'direct' order by code`,
      )
    ).map((r) => r.code);
    expect(direct).toEqual(["A3", "A7"]);
  });

  it("A8 = the no-act contrafactual (no signal, no knob, financial_class none)", async () => {
    const a8 = (
      await rows<{ financial_class: string; root_cause_signal: string | null; threshold_knob: string | null }>(
        pool,
        `select financial_class, root_cause_signal, threshold_knob from catalog."NBA_Catalogo" where code='A8'`,
      )
    )[0];
    expect(a8?.financial_class).toBe("none");
    expect(a8?.root_cause_signal).toBeNull();
    expect(a8?.threshold_knob).toBeNull();
  });

  it("§3.8 thresholds-by-name: every non-null threshold_knob resolves in Config_Knobs", async () => {
    // a catalog action that names a knob that doesn't exist would fail-closed at min()-time — forbid it here.
    const orphans = await count(
      pool,
      `catalog."NBA_Catalogo" n where n.threshold_knob is not null
         and not exists (select 1 from catalog."Config_Knobs" k where k.key = n.threshold_knob)`,
    );
    expect(orphans).toBe(0);
  });

  it("default_nba_request is the conservative LOW arm (never seeds HIGH autonomy)", async () => {
    // §3.10 fail-closed: the catalog's requested-autonomy seed is never HIGH (money/risk can only be lowered).
    expect(
      await count(pool, `catalog."NBA_Catalogo" where default_nba_request = 'HIGH'`),
    ).toBe(0);
    expect(await count(pool, `catalog."NBA_Catalogo" where default_nba_request is null`)).toBe(0);
  });

  it("FK: NBA_Proposal.action_type must be a catalog code (the deferred FK, now wired)", async () => {
    await inTx(async (c) => {
      // minimal valid cohort to satisfy NBA_Proposal's NOT-NULL FKs
      await c.query(
        `insert into cohort."Cohort"(cohort_id, cuisine, zone, tier_base, cohort_rule_version)
           values ('c_nba_fk','sushi','north','long_tail','v1')`,
      );
      // valid action_type → accepted
      await c.query(
        `insert into gov."NBA_Proposal"(action_type, cohort_id, cohort_rule_version)
           values ('A1','c_nba_fk','v1')`,
      );
      // bogus action_type → rejected by the FK
      await expect(
        c.query(
          `insert into gov."NBA_Proposal"(action_type, cohort_id, cohort_rule_version)
             values ('ZZZ','c_nba_fk','v1')`,
        ),
      ).rejects.toThrow();
    });
  });
});
