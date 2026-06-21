import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { TRPCError } from "@trpc/server";
import { makePool, resetDb } from "../helpers/db";
import { runP01 } from "../../server/jobs/p01";
import { sealMinCalculationNBA } from "../../server/conversation/min";
import { autoDispatch } from "../../server/cockpit/autoDispatch";

// 02:CP2 / §7 — autoDispatch: the AI acts ALONE on an auto_releasable, NON-money NBA. The honest trace
// is origin='auto' + confirmer_id=NULL (independence_guaranteed=false — no human confirmed THIS action),
// proposer=the AI, operator=the human who signed the authorizing policy. The §7 money hard-no + the
// auto_releasable gate are RE-CHECKED from the DB at execution (fail-closed, defense-in-depth) and a
// refused attempt writes Security_Log + throws — never a silent no-op, never a money auto-release.
// Every insert runs in a ROLLED-BACK tx so the governance tables stay empty pre-run (§14 antifake).

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

// Pick any real cohort + the pool it lives in + its tier (for the authorizing policy). The §7 logic here is
// driven by CRAFTED verdicts (deterministic), not the data-dependent engine gate — the real engine→auto→
// dispatch e2e is covered in the cockpit.propose integration test.
async function pickPool(
  c: pg.PoolClient,
): Promise<{ cohortId: string; tenant: string; tierBase: string; operator: string; aiAgent: string }> {
  const r = (
    await c.query<{ cohort_id: string; tenant_id: string; tier_base: string }>(
      `select cms.cohort_id, rt.tenant_id, ct.tier_base::text as tier_base
       from cohort."Cohort_Membership_Snapshot" cms
       join tenant."Restaurant" rt on rt.restaurant_id = cms.restaurant_id
       join cohort."Cohort" ct on ct.cohort_id = cms.cohort_id
       where cms.week=$1 order by cms.restaurant_id limit 1`,
      [W1],
    )
  ).rows[0]!;
  // Both governance actors MUST belong to the picked pool: the accountable human signer (autoDispatch
  // enforces in-pool signer) and the AI proposer.
  const op = (
    await c.query<{ user_id: string }>(
      `select user_id from gov."User" where tenant_id=$1 and role='agent_manager_senior' order by user_id limit 1`,
      [r.tenant_id],
    )
  ).rows[0]!;
  const ai = (
    await c.query<{ user_id: string }>(
      `select user_id from gov."User" where tenant_id=$1 and role='ai_agent' order by user_id limit 1`,
      [r.tenant_id],
    )
  ).rows[0]!;
  return { cohortId: r.cohort_id, tenant: r.tenant_id, tierBase: r.tier_base, operator: op.user_id, aiAgent: ai.user_id };
}

// A signed LOW policy for the tier, signed by the IN-POOL operator (the accountable authorizer the
// autonomous trace records). Sorts last by version so autoDispatch resolves THIS one.
async function signPolicy(c: pg.PoolClient, tierBase: string, operator: string): Promise<void> {
  await c.query(
    `insert into gov."Policy_Tier"(policy_id, tier_id, policy_version, tier_cap, human_signature)
     values ('pt-auto', $1, 'pv-zzz-auto', 'LOW', $2)`,
    [tierBase, operator],
  );
}

// Craft a proposal with an explicit financial_class + a sealed min_calculation verdict (no engine), to
// drive each branch precisely. financialDirect=false + nMinOk=true ⇒ auto_releasable=true. version =
// current cohort_rule_version.
async function craftProposal(
  c: pg.PoolClient,
  cohortId: string,
  financialClass: "direct" | "indirect" | "none",
  seal: { financialDirect: boolean; nMinOk: boolean },
): Promise<string> {
  const version = (
    await c.query<{ value: string }>(`select value from catalog."Config_Knobs" where key='cohort_rule_version_current'`)
  ).rows[0]!.value;
  const action = financialClass === "direct" ? "A3" : "A1";
  const ins = (
    await c.query<{ nba_id: string }>(
      `insert into gov."NBA_Proposal"(action_type, cohort_id, financial_class, cohort_rule_version)
       values ($1,$2,$3::public.financial_class,$4) returning nba_id::text as nba_id`,
      [action, cohortId, financialClass, version],
    )
  ).rows[0]!;
  await sealMinCalculationNBA(
    {
      nbaId: ins.nba_id,
      nbaRequest: "LOW",
      releasedEvals: "LOW",
      tierCap: "LOW",
      financialDirect: seal.financialDirect,
      nMinOk: seal.nMinOk,
      kAnonOk: true,
      policyResolved: true,
    },
    c,
  );
  return ins.nba_id;
}

async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    return await fn(c);
  } finally {
    await c.query("rollback");
    c.release();
  }
}

describe("02:CP2 — autoDispatch (the AI acts alone, §7-honest)", () => {
  it("auto_releasable + non-money ⇒ dispatches with an origin='auto', un-confirmed trace", async () => {
    await tx(async (c) => {
      const { cohortId, tenant, tierBase, operator, aiAgent } = await pickPool(c);
      await signPolicy(c, tierBase, operator);
      const nbaId = await craftProposal(c, cohortId, "none", { financialDirect: false, nMinOk: true });
      const out = await autoDispatch(nbaId, tenant, c);
      expect(out.dispatchId).toBeTruthy();

      const dt = (
        await c.query<{
          origin: string;
          confirmer_id: string | null;
          independence_guaranteed: boolean;
          proposer_id: string;
        }>(`select origin::text as origin, confirmer_id, independence_guaranteed, proposer_id
            from gov."Decision_Trace" where trace_id=$1`, [out.traceId])
      ).rows[0]!;
      expect(dt.origin).toBe("auto"); // the autonomous audit origin
      expect(dt.confirmer_id).toBeNull(); // no human confirmed this action
      expect(dt.independence_guaranteed).toBe(false); // GENERATED from confirmer null — honest §3.6
      expect(dt.proposer_id).toBe(aiAgent); // the in-pool AI proposed it

      const rb = (
        await c.query<{ proposer_id: string; operator_id: string }>(
          `select proposer_id, operator_id from gov."Release_Batch" where release_id=$1`,
          [out.releaseId],
        )
      ).rows[0]!;
      expect(rb.proposer_id).toBe(aiAgent);
      expect(rb.operator_id).toBe(operator); // the in-pool human who SIGNED the policy that authorizes autonomy

      const disp = await c.query(`select 1 from gov."Action_Dispatch" where nba_id=$1`, [nbaId]);
      expect(disp.rowCount).toBe(1);
    });
  });

  it("money (financial_class=direct) ⇒ REFUSED even if a verdict says auto (defense-in-depth §7)", async () => {
    await tx(async (c) => {
      const { cohortId, tenant } = await pickPool(c);
      // inconsistent on purpose: the verdict was sealed non-money (auto_releasable=true) but the proposal
      // IS money — the money re-check must still refuse it.
      const moneyNba = await craftProposal(c, cohortId, "direct", { financialDirect: false, nMinOk: true });
      await expect(autoDispatch(moneyNba, tenant, c)).rejects.toBeInstanceOf(TRPCError);

      const disp = await c.query(`select 1 from gov."Action_Dispatch" where nba_id=$1`, [moneyNba]);
      expect(disp.rowCount).toBe(0); // nothing dispatched
      const log = await c.query<{ detail: { reason: string } }>(
        `select detail from gov."Security_Log" where kind='auto_dispatch_blocked' and detail->>'nba_id'=$1`,
        [moneyNba],
      );
      expect(log.rows[0]!.detail.reason).toBe("money");
    });
  });

  it("not auto_releasable (failed gate) ⇒ REFUSED + logged (fail-closed)", async () => {
    await tx(async (c) => {
      const { cohortId, tenant } = await pickPool(c);
      const blocked = await craftProposal(c, cohortId, "none", { financialDirect: false, nMinOk: false });
      await expect(autoDispatch(blocked, tenant, c)).rejects.toBeInstanceOf(TRPCError);
      const disp = await c.query(`select 1 from gov."Action_Dispatch" where nba_id=$1`, [blocked]);
      expect(disp.rowCount).toBe(0);
      const log = await c.query<{ detail: { reason: string } }>(
        `select detail from gov."Security_Log" where kind='auto_dispatch_blocked' and detail->>'nba_id'=$1`,
        [blocked],
      );
      expect(log.rows[0]!.detail.reason).toBe("not_auto_releasable");
    });
  });

  it("idempotent: a second autoDispatch of the same NBA is blocked (no double dispatch)", async () => {
    await tx(async (c) => {
      const { cohortId, tenant, tierBase, operator } = await pickPool(c);
      await signPolicy(c, tierBase, operator);
      const nbaId = await craftProposal(c, cohortId, "none", { financialDirect: false, nMinOk: true });
      await autoDispatch(nbaId, tenant, c);
      await expect(autoDispatch(nbaId, tenant, c)).rejects.toMatchObject({ code: "CONFLICT" });
    });
  });

  it("same (cohort, action) auto-acts once — a rerun's fresh nba_id cannot duplicate the effect (Codex P1)", async () => {
    await tx(async (c) => {
      const { cohortId, tenant, tierBase, operator } = await pickPool(c);
      await signPolicy(c, tierBase, operator);
      const first = await craftProposal(c, cohortId, "none", { financialDirect: false, nMinOk: true });
      await autoDispatch(first, tenant, c);
      // a SECOND proposal (new nba_id, same cohort + action A1) must NOT be auto-dispatched again.
      const second = await craftProposal(c, cohortId, "none", { financialDirect: false, nMinOk: true });
      await expect(autoDispatch(second, tenant, c)).rejects.toMatchObject({ code: "CONFLICT" });
      const disp = await c.query(`select 1 from gov."Action_Dispatch" where nba_id=$1`, [second]);
      expect(disp.rowCount).toBe(0); // the duplicate effect was prevented
    });
  });

  it("cross-pool: a foreign tenant cannot auto-dispatch another pool's NBA (no leak)", async () => {
    await tx(async (c) => {
      const { cohortId, tierBase, operator } = await pickPool(c);
      await signPolicy(c, tierBase, operator);
      const nbaId = await craftProposal(c, cohortId, "none", { financialDirect: false, nMinOk: true });
      await expect(autoDispatch(nbaId, "POOL-999", c)).rejects.toMatchObject({ code: "NOT_FOUND" });
      const disp = await c.query(`select 1 from gov."Action_Dispatch" where nba_id=$1`, [nbaId]);
      expect(disp.rowCount).toBe(0);
    });
  });
});
