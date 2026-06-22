import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { uploadCockpitConfig, buildConfigTemplate } from "../../server/cockpit/configUpload";
import { cockpitConfigInput } from "../../shared/contracts_cockpit_config";

// 02:CP — operator-owned cockpit config upload (Policy_Tier + named knobs). §14-safe (inputs only, never a
// RESULT), atomic (one bad item rejects the whole upload, §7), tenant-scoped (signer must be in the pool, §3.4),
// and the template round-trips through the upload schema so uploading it as-is can't break (pra não quebrar).
let pool: pg.Pool;
beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
}, 120_000);
afterAll(async () => {
  await resetDb(pool);
  await pool.end();
});

const TENANT = "POOL-001";
const signerOf = async (): Promise<string> =>
  (
    await pool.query<{ u: string }>(
      `select user_id u from gov."User" where tenant_id=$1 and role='agent_manager_senior' order by user_id limit 1`,
      [TENANT],
    )
  ).rows[0]!.u;

describe("02:CP — cockpit config upload (operator governance, §14-safe)", () => {
  it("the template round-trips through the upload schema (pra não quebrar)", async () => {
    const tpl = await buildConfigTemplate(TENANT);
    const parsed = cockpitConfigInput.safeParse(JSON.parse(tpl.json));
    expect(parsed.success).toBe(true);
  });

  it("a valid upload upserts knob ([V]/operator) + Policy_Tier (tier_cap) and writes NO result column (§14)", async () => {
    const signer = await signerOf();
    const out = await uploadCockpitConfig(
      {
        knobs: [{ key: "k_anon_threshold", value: "7" }],
        policy_tiers: [
          {
            policy_id: "PT-up",
            tier_id: "managed_brand",
            policy_version: "pv-up",
            tier_cap: "MEDIUM",
            allowed_today: { auto_actions: ["A1"] },
            human_signature: signer,
          },
        ],
      },
      TENANT,
    );
    expect(out).toEqual({ knobs: 1, policy_tiers: 1 });

    const k = (
      await pool.query<{ value: string; prov: string; owner: string }>(
        `select value, provenance prov, owner from catalog."Config_Knobs" where key='k_anon_threshold'`,
      )
    ).rows[0]!;
    expect(k.value).toBe("7");
    expect(k.prov).toBe("[V]"); // operator-set
    expect(k.owner).toBe("operator");

    const p = (
      await pool.query<{ cap: string; mr: string | null }>(
        `select tier_cap cap, measured_result mr from gov."Policy_Tier" where policy_id='PT-up'`,
      )
    ).rows[0]!;
    expect(p.cap).toBe("MEDIUM");
    expect(p.mr).toBeNull(); // §14: the RESULT column is NEVER written by an upload
  });

  it("rejects an unknown knob key and is ATOMIC (the valid knob in the same upload does not persist)", async () => {
    const before = (
      await pool.query<{ value: string }>(`select value from catalog."Config_Knobs" where key='n_min_threshold'`)
    ).rows[0]!.value;
    await expect(
      uploadCockpitConfig(
        {
          knobs: [
            { key: "n_min_threshold", value: "999" },
            { key: "totally_made_up_knob", value: "x" },
          ],
          policy_tiers: [],
        },
        TENANT,
      ),
    ).rejects.toThrow();
    const after = (
      await pool.query<{ value: string }>(`select value from catalog."Config_Knobs" where key='n_min_threshold'`)
    ).rows[0]!.value;
    expect(after).toBe(before); // rolled back ⇒ the valid sibling write did NOT leak (§7 fail-closed)
  });

  it("rejects a signer who is not a user in this pool (§3.4) and writes nothing", async () => {
    await expect(
      uploadCockpitConfig(
        {
          knobs: [],
          policy_tiers: [
            {
              policy_id: "PT-bad",
              tier_id: "managed_brand",
              policy_version: "pv-bad",
              tier_cap: "LOW",
              allowed_today: { auto_actions: [] },
              human_signature: "U-DOES-NOT-EXIST",
            },
          ],
        },
        TENANT,
      ),
    ).rejects.toThrow();
    const n = (await pool.query(`select 1 from gov."Policy_Tier" where policy_id='PT-bad'`)).rowCount;
    expect(n).toBe(0);
  });

  it("rejects an out-of-range safety-knob value (§3.8 allowlist + range, fail-closed)", async () => {
    const before = (
      await pool.query<{ value: string }>(`select value from catalog."Config_Knobs" where key='k_anon_threshold'`)
    ).rows[0]!.value;
    await expect(
      uploadCockpitConfig({ knobs: [{ key: "k_anon_threshold", value: "-1" }], policy_tiers: [] }, TENANT),
    ).rejects.toThrow();
    // and the anchor knob is not even operator-settable
    await expect(
      uploadCockpitConfig({ knobs: [{ key: "cohort_rule_version_current", value: "invented" }], policy_tiers: [] }, TENANT),
    ).rejects.toThrow();
    const after = (
      await pool.query<{ value: string }>(`select value from catalog."Config_Knobs" where key='k_anon_threshold'`)
    ).rows[0]!.value;
    expect(after).toBe(before); // nothing corrupted
  });

  it("rejects a signer who exists in-pool but is NOT a senior manager (authority, §3.4)", async () => {
    await expect(
      uploadCockpitConfig(
        {
          knobs: [],
          policy_tiers: [
            {
              policy_id: "PT-ai",
              tier_id: "managed_brand",
              policy_version: "pv-ai",
              tier_cap: "MEDIUM",
              allowed_today: { auto_actions: [] },
              human_signature: "U-AI-001", // exists in POOL-001 but role='ai_agent', not a manager
            },
          ],
        },
        TENANT,
      ),
    ).rejects.toThrow();
    const n = (await pool.query(`select 1 from gov."Policy_Tier" where policy_id='PT-ai'`)).rowCount;
    expect(n).toBe(0);
  });
});
