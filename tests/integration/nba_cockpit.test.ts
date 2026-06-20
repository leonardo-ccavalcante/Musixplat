import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";
import { proposeNba } from "../../server/agente/nba_engine";
import { cockpitStatus, listCockpitRows, weekSummary, type Exec } from "../../server/routers/cockpit";

// 02:EPIC-1 / F-1.1 — the cockpit read surface: proposals per cohort with AUTO vs needs-human + reason,
// tenant-scoped (a foreign pool sees nothing). Mutations run in a ROLLED-BACK tx (§14 antifake: the
// shared DB must stay empty pre-run).

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

describe("02:F-1.1 — cockpitStatus pure mapping (AUTO vs needs-human + reason)", () => {
  it("auto_releasable=true ⇒ auto / no reason", () => {
    expect(cockpitStatus({ auto_releasable: true, financial_class: "none", effective_level: "LOW" })).toEqual({
      status: "auto",
      reason: null,
    });
  });
  it("money ⇒ needs_human / money (hard-no wins)", () => {
    expect(cockpitStatus({ auto_releasable: false, financial_class: "direct", effective_level: "LOW" })).toEqual({
      status: "needs_human",
      reason: "money",
    });
  });
  it("non-LOW level ⇒ needs_human / level", () => {
    expect(cockpitStatus({ auto_releasable: false, financial_class: "none", effective_level: "MEDIUM" })).toEqual({
      status: "needs_human",
      reason: "level",
    });
  });
  it("LOW + non-money but a gate failed ⇒ needs_human / gates", () => {
    expect(cockpitStatus({ auto_releasable: false, financial_class: "none", effective_level: "LOW" })).toEqual({
      status: "needs_human",
      reason: "gates",
    });
  });
  it("auto_releasable null ⇒ needs_human (fail-closed)", () => {
    expect(cockpitStatus({ auto_releasable: null, financial_class: "none", effective_level: null }).status).toBe(
      "needs_human",
    );
  });
});

describe("02:F-1.1 — listCockpitRows over real proposals", () => {
  it("lists a proposal with its autonomy verdict; foreign tenant sees nothing", async () => {
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

      // Real governance inputs (the 2nd/3rd min() arms) so the gate can clear: a LOW root policy + a green eval.
      await c.query(
        `insert into gov."Policy_Tier"(policy_id, tier_id, policy_version, tier_cap) values ('pt-cp', $1, 'pv-cp', 'LOW')`,
        [r.tier_base],
      );
      await c.query(
        `insert into gov."Eval_Cell"(cohort_id, intent, version, released_evals, status) values ($1, $2, 'v1', 'LOW', 'green')`,
        [r.cohort_id, intent],
      );

      const res = await proposeNba({ restaurantId: r.restaurant_id, cohortId: r.cohort_id, week: W1 }, undefined, c);

      const rows = await listCockpitRows(tId, exec);
      const row = rows.find((x) => x.nba_id === res.nbaId);
      expect(row, "the proposal shows up in the pool's cockpit").toBeTruthy();
      expect(row!.cohort_id).toBe(r.cohort_id);
      expect(row!.action_type).toBe(res.actionType);
      // status is consistent with the SQL-computed auto_releasable (never recomputed)
      expect(row!.status === "auto").toBe(row!.auto_releasable === true);
      if (row!.status === "auto") expect(row!.reason).toBeNull();

      // Tenant isolation: a foreign pool never sees this proposal (RLS single-pool, no leak).
      const foreign = await listCockpitRows("tenant-does-not-exist", exec);
      expect(foreign.find((x) => x.nba_id === res.nbaId)).toBeUndefined();
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
});

describe("02:F-1.2 — weekSummary counts traced decisions (read, §14: 0 before any release)", () => {
  it("0/0 on an empty trace; +1 released after a RELEASE in-pool; a foreign pool sees 0", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      const exec: Exec = (sql, params) => c.query(sql, params as unknown[]).then((r) => r.rows) as never;

      const row = (
        await c.query<{ tenant_id: string; cohort_id: string }>(
          `select r.tenant_id, cms.cohort_id
           from cohort."Cohort_Membership_Snapshot" cms
           join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id
           where cms.week=$1 order by cms.restaurant_id limit 1`,
          [W1],
        )
      ).rows[0]!;
      const users = (await c.query<{ user_id: string }>(`select user_id from gov."User" order by user_id limit 2`)).rows;

      // anti-fake: nothing released yet ⇒ the producer (the trace) reports 0, never a seeded number.
      expect(await weekSummary(row.tenant_id, exec)).toEqual({ released: 0, paused: 0 });

      // a real human RELEASE writes a Release_Batch (the decision trace) for an in-pool cohort.
      await c.query(
        `insert into gov."Release_Batch"(release_id, cohort_id, action, proposer_id, operator_id)
         values ('rb-week-test', $1, 'RELEASE', $2, $3)`,
        [row.cohort_id, users[0]!.user_id, users[1]!.user_id],
      );

      expect(await weekSummary(row.tenant_id, exec)).toEqual({ released: 1, paused: 0 });
      // tenant isolation: a foreign pool never counts this decision.
      expect(await weekSummary("tenant-does-not-exist", exec)).toEqual({ released: 0, paused: 0 });
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
});
