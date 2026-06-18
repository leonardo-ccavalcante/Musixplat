import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, rows } from "../helpers/db";

// 05B Knowledge_Case — the learning-loop store (BR-B16). It keeps BOTH polarities of a closed
// case so the loop CONVERGES instead of oscillating:
//   * POSITIVE (how it was solved): resolution + path_used — replicated next time.
//   * NEGATIVE (why it did NOT): not_resolved_reason + discarded_branches — pruned next time so
//     grounding stops re-proposing dead hypotheses.
// Provenance split (anti-fake §14 + BR-B8): `outcome` is a MEASURED fact (resolved/not) ⇒ [V]/[I];
// the narrative `not_resolved_reason` is AI text ⇒ [C], never a number, human-gated (reviewed=false).
// The polarity invariant is enforced at the SCHEMA (fail-closed, §3.7): a case cannot claim resolved
// without "how", nor unresolved/escalated without "why". `outcome` is NULL-able (§14: a KB row with no
// producer-stamped outcome stays NULL, never assumed). No producer is wired this session — these
// inserts PROVE the contract the future EPIC-B4/FILA producer must honor; they are test fixtures,
// NOT seed data (Knowledge_Case is still empty in seed.sql, asserted by the antifake gate).

let pool: pg.Pool;

beforeAll(async () => {
  pool = makePool();
}, 60_000);

// KB-only slate: no incoming FKs, so a direct delete is enough (and avoids a full 5000-row reseed).
beforeEach(async () => {
  await pool.query(`delete from tenant."Knowledge_Case"`);
});

afterAll(async () => {
  await pool.end();
});

describe("05B Knowledge_Case — two-polarity learning store (BR-B16, §14 provenance split)", () => {
  it("POSITIVE polarity: a resolved case stores HOW (resolution) + outcome=[I] measured", async () => {
    await pool.query(
      `insert into tenant."Knowledge_Case"
         (tenant_id, area_type, pattern, outcome, resolution, path_used, provenance_by_field)
       values ('POOL-001','finance','silent_failed_payment','resolved',
               'retry charge + notify restaurant',
               '["payment","retry"]'::jsonb,
               '{"outcome":"[I]","resolution":"[C]"}'::jsonb)`,
    );
    const r = await rows<{
      outcome: string;
      resolution: string;
      not_resolved_reason: string | null;
      discarded_branches: unknown[];
      prov: Record<string, string>;
    }>(
      pool,
      `select outcome, resolution, not_resolved_reason, discarded_branches,
              provenance_by_field as prov from tenant."Knowledge_Case"`,
    );
    expect(r[0]?.outcome).toBe("resolved");
    expect(r[0]?.resolution).toContain("retry");
    expect(r[0]?.not_resolved_reason).toBeNull(); // resolved ⇒ no "why not"
    expect(r[0]?.discarded_branches).toEqual([]); // default empty
    expect(r[0]?.prov.outcome).toBe("[I]"); // MEASURED fact
  });

  it("NEGATIVE polarity: a not_resolved case stores WHY + discarded_branches + reason=[C]", async () => {
    await pool.query(
      `insert into tenant."Knowledge_Case"
         (tenant_id, area_type, pattern, outcome, not_resolved_reason, discarded_branches, provenance_by_field)
       values ('POOL-001','finance','silent_failed_payment','not_resolved',
               'restaurant did not respond in the window',
               '[{"branch":"fraud","falsified_by":"no chargeback","reason":"no fraud signal"}]'::jsonb,
               '{"outcome":"[I]","not_resolved_reason":"[C]"}'::jsonb)`,
    );
    const r = await rows<{
      outcome: string;
      resolution: string | null;
      not_resolved_reason: string;
      discarded_branches: Array<{ branch: string; reason: string }>;
      prov: Record<string, string>;
    }>(
      pool,
      `select outcome, resolution, not_resolved_reason, discarded_branches,
              provenance_by_field as prov from tenant."Knowledge_Case"`,
    );
    expect(r[0]?.outcome).toBe("not_resolved");
    expect(r[0]?.resolution).toBeNull(); // not resolved ⇒ no "how"
    expect(r[0]?.not_resolved_reason).toContain("did not respond");
    expect(r[0]?.discarded_branches[0]?.branch).toBe("fraud"); // the pruned hypothesis
    expect(r[0]?.prov.not_resolved_reason).toBe("[C]"); // AI narrative, never a number
  });

  it("invariant (fail-closed): outcome='resolved' WITHOUT a resolution is rejected", async () => {
    await expect(
      pool.query(
        `insert into tenant."Knowledge_Case" (tenant_id, area_type, outcome)
           values ('POOL-001','finance','resolved')`,
      ),
    ).rejects.toThrow();
  });

  it("invariant (fail-closed): outcome='not_resolved' WITHOUT a not_resolved_reason is rejected", async () => {
    await expect(
      pool.query(
        `insert into tenant."Knowledge_Case" (tenant_id, area_type, outcome)
           values ('POOL-001','finance','not_resolved')`,
      ),
    ).rejects.toThrow();
  });

  it("invariant (fail-closed): outcome='escalated' shares the not_resolved clause — needs a reason", async () => {
    // escalated WITHOUT a reason is rejected (guards against a future edit dropping 'escalated' from
    // the polarity clause and silently letting a why-less escalation through)…
    await expect(
      pool.query(
        `insert into tenant."Knowledge_Case" (tenant_id, area_type, outcome)
           values ('POOL-001','finance','escalated')`,
      ),
    ).rejects.toThrow();
    // …and the inverse: escalated WITH a reason is accepted (the branch is live, not dead).
    await pool.query(
      `insert into tenant."Knowledge_Case"
         (tenant_id, area_type, outcome, not_resolved_reason, provenance_by_field)
       values ('POOL-001','finance','escalated','handed to human ops',
               '{"outcome":"[I]","not_resolved_reason":"[C]"}'::jsonb)`,
    );
    const r = await rows<{ outcome: string }>(
      pool,
      `select outcome from tenant."Knowledge_Case" where outcome='escalated'`,
    );
    expect(r[0]?.outcome).toBe("escalated");
  });

  it("domain (fail-closed): a bogus outcome value is rejected", async () => {
    await expect(
      pool.query(
        `insert into tenant."Knowledge_Case" (tenant_id, area_type, outcome, resolution)
           values ('POOL-001','finance','maybe','x')`,
      ),
    ).rejects.toThrow();
  });

  it("anti-fake §14: outcome is NULL-able pre-producer (a KB row with no measured outcome)", async () => {
    await pool.query(
      `insert into tenant."Knowledge_Case" (tenant_id, area_type, pattern)
         values ('POOL-001','finance','silent_failed_payment')`,
    );
    const r = await rows<{ outcome: string | null; reviewed_default: boolean }>(
      pool,
      `select outcome, reviewed as reviewed_default from tenant."Knowledge_Case"`,
    );
    expect(r[0]?.outcome).toBeNull(); // never assumed
    expect(r[0]?.reviewed_default).toBe(false); // BR-B16: human-gated by default
  });
});
