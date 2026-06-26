import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";
import { runP02 } from "../../server/jobs/p02";
import { runEval, motorEvalProvider } from "../../server/eval/runEval";
import { DEMO_GOLDEN_VERSION } from "../../server/eval/seedGoldenSet";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";

// EPIC-B4 demo wiring (follow-up #1) — runP02 now PRODUCES a real measured eval cell so the hosted cockpit
// shows a [V] verdict, not just the [I] floor. The AI under eval = the real motor (deterministic gap-rank);
// promotion stays human (released_evals NOT raised by the run). Mirrors run_p02_job.test.ts setup.
const WEEK = "2026-05-25";
const REF = "2026-06-17";
function caller(tenantId: string, userId: string) {
  const ctx: Context = { session: { user_id: userId, tenant_id: tenantId, org_level: "team" }, tenantId, userId };
  return appRouter.createCaller(ctx);
}

let pool: pg.Pool;
beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
  await runP01({ week: WEEK, refDate: REF });
  await runP02({ week: WEEK, sampleLimit: 12 }); // includes seedGoldenSet + runEval(motorEvalProvider)
}, 240_000);
afterAll(async () => {
  await pool.end();
});

async function demoCell() {
  return (
    await rows<{
      cohort_id: string;
      intent: string;
      status: string;
      n_golden_cases: number;
      kappa: number | null;
      released_evals: string | null;
      redteam_independence_flag: boolean;
      prov: Record<string, string>;
    }>(
      pool,
      `select cohort_id, intent, status, n_golden_cases, kappa::float8 as kappa, released_evals,
              redteam_independence_flag, provenance_by_field as prov
         from gov."Eval_Cell" where version=$1`,
      [DEMO_GOLDEN_VERSION],
    )
  )[0];
}

describe("EPIC-B4 demo wiring — runP02 produces a measured [V] eval cell (promotion still human)", () => {
  it("SC-D1: a real green cell with measured κ/n/redteam, provenance [V], released_evals NULL (not promoted)", async () => {
    const cell = await demoCell();
    expect(cell).toBeDefined();
    expect(cell!.status).toBe("green");
    expect(cell!.n_golden_cases).toBeGreaterThanOrEqual(30); // >= eval_min_n
    expect(cell!.kappa).not.toBeNull();
    expect(cell!.kappa!).toBeGreaterThanOrEqual(0.6); // >= eval_kappa_min (reliable golden set)
    expect(cell!.redteam_independence_flag).toBe(true);
    expect(cell!.prov.status).toBe("[V]"); // a MEASURED pass, not the [I] floor
    // INV-D2: the run produced the EVIDENCE but did NOT raise autonomy — promotion is a human act.
    expect(cell!.released_evals).toBeNull();
  });

  it("INV-D3: the number is the real motor's — pass_rate has weight (green but < 1.0, deterministic ~0.9)", async () => {
    const cell = await demoCell();
    const v = await runEval(cell!.cohort_id, cell!.intent, DEMO_GOLDEN_VERSION, motorEvalProvider);
    expect(v.status).toBe("green");
    expect(v.passRate).toBeGreaterThanOrEqual(0.8); // green
    expect(v.passRate).toBeLessThan(1); // the ~10% human-override cases the AI genuinely misses (real prova)
  });

  it("SC-D2: observatory.evalList surfaces the cell as a measured [V] pass for the owning pool", async () => {
    const cell = await demoCell();
    const tenantId = (
      await rows<{ tenant_id: string }>(
        pool,
        `select r.tenant_id from cohort."Cohort_Membership_Snapshot" cms
           join tenant."Restaurant" r on r.restaurant_id = cms.restaurant_id
          where cms.cohort_id=$1 limit 1`,
        [cell!.cohort_id],
      )
    )[0]!.tenant_id;
    const userId = (
      await rows<{ user_id: string }>(pool, `select user_id from gov."User" where tenant_id=$1 and role='agent_manager_senior' limit 1`, [
        tenantId,
      ])
    )[0]!.user_id;

    const list = await caller(tenantId, userId).observatory.evalList();
    const shown = list.find((c) => c.cohortId === cell!.cohort_id && c.version === DEMO_GOLDEN_VERSION);
    expect(shown).toBeDefined();
    expect(shown!.status).toBe("green");
    expect(shown!.provenanceByField.status).toBe("[V]"); // measured, not the [I] floor row
  });

  it("SC-D3: re-running runP02 is idempotent — no duplicate cases, verdict stable", async () => {
    const cell = await demoCell();
    const casesBefore = Number(
      (await rows<{ n: string }>(pool, `select count(*)::text n from gov."Eval_Case" where version=$1`, [DEMO_GOLDEN_VERSION]))[0]!.n,
    );
    await runP02({ week: WEEK, sampleLimit: 12 });
    const casesAfter = Number(
      (await rows<{ n: string }>(pool, `select count(*)::text n from gov."Eval_Case" where version=$1`, [DEMO_GOLDEN_VERSION]))[0]!.n,
    );
    expect(casesAfter).toBe(casesBefore); // no duplication
    const cell2 = await demoCell();
    expect(cell2!.status).toBe(cell!.status); // verdict stable
    expect(cell2!.n_golden_cases).toBe(cell!.n_golden_cases);
  });
});
