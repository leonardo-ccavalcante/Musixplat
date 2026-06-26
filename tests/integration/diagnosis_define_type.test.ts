import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import { resolveDescriptor } from "../../server/diagnosis/resolveDescriptor";
import { PROBLEM_TYPES } from "../../shared/problem_types";
import type { DefineTypeInput } from "../../shared/contracts_05b";
import type { Context } from "../../server/_core/context";

// 05D L3 — diagnosis.defineType: an operator teaches a NEW problem type at runtime (manager-gated). Plus the
// rot-lock guards that keep the registry honest: builtins stay in CODE (resolveDescriptor byte-identical),
// the live registry never holds a builtin, and the §7 immutability + §14 measured_by:null are enforced.

const POOL = "POOL-DEF";

function caller(userId: string, tenantId = POOL) {
  const ctx: Context = {
    session: { user_id: userId, tenant_id: tenantId, org_level: "team" },
    tenantId,
    userId,
  };
  return appRouter.createCaller(ctx);
}

let pool: pg.Pool;

async function seedUsers(): Promise<void> {
  await pool.query(
    `insert into gov."User"(user_id, tenant_id, org_level, role)
     values ('U-MGR', $1, 'team', 'agent_manager_senior'), ('U-OP', $1, 'team', 'agent')`,
    [POOL],
  );
}

const INPUT: DefineTypeInput = {
  problem_type: "weekend_blackout",
  label: "Weekend blackout",
  area_type: "operations",
  concentration_dim: "zone",
  measured_by: "connection",
  hypotheses: ["staff scheduling gap", "weekend POS not provisioned"],
};

beforeAll(async () => {
  pool = makePool();
}, 60_000);
beforeEach(async () => {
  await resetDb(pool);
  await pool.query(`delete from catalog."Problem_Type" where origin = 'live'`);
  await seedUsers();
});
afterAll(async () => {
  await pool.end();
});

describe("05D L3 — diagnosis.defineType (manager-gated, §7/§14)", () => {
  it("a senior manager teaches a live type → it resolves via resolveDescriptor (frame + inherited measurement)", async () => {
    const r = await caller("U-MGR").diagnosis.defineType(INPUT);
    expect(r).toEqual({ problem_type: "weekend_blackout", measurable: true });

    const d = await resolveDescriptor("weekend_blackout");
    expect(d.origin).toBe("live");
    expect(d.area_type).toBe("operations"); // operator's frame
    expect(d.measured_by).toBe("connection");
    expect(d.hypotheses).toEqual(INPUT.hypotheses);
    expect(d.affected).toEqual(PROBLEM_TYPES.connection!.affected); // measurement INHERITED from the bound builtin
  });

  it("a non-manager is FORBIDDEN (governance gate, §3.4)", async () => {
    await expect(caller("U-OP").diagnosis.defineType(INPUT)).rejects.toThrow(/senior manager/i);
  });

  it("rejects a slug that shadows a built-in (fail-closed)", async () => {
    await expect(
      caller("U-MGR").diagnosis.defineType({ ...INPUT, problem_type: "payment" }),
    ).rejects.toThrow(/built-in/i);
  });

  it("measured_by=null is allowed (unmeasurable) → measurable:false", async () => {
    const r = await caller("U-MGR").diagnosis.defineType({ ...INPUT, problem_type: "mystery_q", measured_by: null });
    expect(r.measurable).toBe(false);
  });

  it("rejects an unknown measured_by (allowlist = the builtins, single source PROBLEM_TYPES)", async () => {
    await expect(
      caller("U-MGR").diagnosis.defineType({ ...INPUT, measured_by: "not_a_producer" }),
    ).rejects.toThrow();
  });

  it("IMMUTABLE once used: defining a type already on a Diagnosed_Problem is rejected (§7)", async () => {
    await pool.query(
      `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
       values ('R-IM', $1, 'long_tail', 'long_tail'::segment, date '2026-01-01', 'Centro')`,
      [POOL],
    );
    await pool.query(
      `insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, status, frequency, problem_type)
       values ($1, 'R-IM', 'open', 1, 'frozen_type')`,
      [POOL],
    );
    await expect(
      caller("U-MGR").diagnosis.defineType({ ...INPUT, problem_type: "frozen_type" }),
    ).rejects.toThrow(/in use|frozen/i);
  });
});

describe("05D L3 — rot-lock (one home per type; the registry stays honest)", () => {
  it("no builtin row leaks into the live registry (builtins live in code)", async () => {
    const n = await pool.query<{ n: number }>(
      `select count(*)::int n from catalog."Problem_Type" where origin = 'builtin'`,
    );
    expect(n.rows[0]!.n).toBe(0);
  });

  it("resolveDescriptor returns each builtin descriptor unchanged (byte-identical, §3.11)", async () => {
    for (const t of Object.keys(PROBLEM_TYPES)) {
      expect(await resolveDescriptor(t)).toEqual(PROBLEM_TYPES[t]);
    }
  });

  it("an unknown type still RAISES fail-closed (same contract as the old getDescriptor)", async () => {
    await expect(resolveDescriptor("does_not_exist")).rejects.toThrow(/unknown problem_type/);
  });
});

// 05D L3 — the registry is PLATFORM-WIDE BY DESIGN (Leo, 2026-06-26): a taught type is shared across pools
// like a builtin (the Config_Knobs governance model), and the immutability freeze is intentionally CROSS-POOL
// (protects every pool's baseline). These tests PIN that intended behavior so it can't silently drift.
describe("05D L3 — platform-wide registry (intended global semantics, pinned)", () => {
  const POOL_B = "POOL-DEF-B";
  beforeEach(async () => {
    await pool.query(
      `insert into gov."User"(user_id, tenant_id, org_level, role) values ('U-MGR-B', $1, 'team', 'agent_manager_senior')`,
      [POOL_B],
    );
  });

  it("a type taught by one pool is resolvable platform-wide (global, no tenant)", async () => {
    await caller("U-MGR").diagnosis.defineType({ ...INPUT, problem_type: "global_type" });
    const d = await resolveDescriptor("global_type");
    expect(d.origin).toBe("live");
    expect(d.measured_by).toBe("connection");
  });

  it("once ANY pool USES a type, its definition is frozen against EVERY pool (cross-pool baseline protection)", async () => {
    await caller("U-MGR").diagnosis.defineType({ ...INPUT, problem_type: "shared_frozen" });
    // POOL-DEF reports a problem of it ⇒ now used.
    await pool.query(
      `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
       values ('R-A', $1, 'long_tail', 'long_tail'::segment, date '2026-01-01', 'Centro')`,
      [POOL],
    );
    await pool.query(
      `insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, status, frequency, problem_type)
       values ($1, 'R-A', 'open', 1, 'shared_frozen')`,
      [POOL],
    );
    // A DIFFERENT pool's senior manager can no longer redefine it (frozen cross-pool).
    await expect(
      caller("U-MGR-B", POOL_B).diagnosis.defineType({ ...INPUT, problem_type: "shared_frozen", measured_by: "cancellation" }),
    ).rejects.toThrow(/in use|frozen/i);
  });
});
