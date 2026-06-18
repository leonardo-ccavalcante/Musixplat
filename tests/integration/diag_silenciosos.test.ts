import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, count, rows } from "../helpers/db";
import { cazarSilenciosos, reconcileAffected } from "../../server/diagnostico/silenciosos";

// 05B:B.5.2b (hunt-silent) + US-B1.3.1 (reconcile). ⭐ the uau. The anti-join
// (Order failed ∖ Conversation-complainants) lives in SQL (tenant.fn_hunt_silent); TS only
// orchestrates (§3.6). Anti-fake §14: Affected is EMPTY pre-run — its rows are produced by the
// fn, never seeded. window via the 'window_silent' knob BY NAME (§3.8). BR-B4 fail-closed:
// no observable population ⇒ not_evaluable, NEVER assume zero silent. tenant scoping = BR-B6.
//
// Fixture lives in a DEDICATED tenant (POOL-DIAG) so the anti-join count is the EXACT controlled
// set, isolated from the seed's POOL-001 per-restaurant failed noise. The spec's "47/35" is an
// illustrative scenario placeholder [C]; this proves the LOGIC with a small deterministic set.
//   N = 4 affected   (each restaurant has ≥1 failed Order inside the window)
//   M = 2 complainants (have a Conversation_Episode in the tenant ⇒ complained=true)
//   ⇒ silent = N − M = 2  (affected but with NO ticket — the silent ones we hunt)
const N_AFETADOS = 4;
const M_RECLAMANTES = 2;
const VENTANA = 30; // matches the seeded 'window_silent' [C] knob; passed explicitly for determinism.

let pool: pg.Pool;

// 4 fixture restaurants in POOL-DIAG. order_date = current_date (inside ANY positive window).
//   R-SIL-1: failed + Conversation  → affected, complained
//   R-SIL-2: failed + Conversation  → affected, complained
//   R-SIL-3: failed, NO Conversation → affected, SILENT
//   R-SIL-4: failed + ok,  NO Conversation → affected (only failed drives it), SILENT
async function seedFixture(): Promise<string> {
  await pool.query(`
    insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date)
    values ('R-SIL-1','POOL-DIAG','long_tail','long_tail', date '2026-01-01'),
           ('R-SIL-2','POOL-DIAG','long_tail','long_tail', date '2026-01-01'),
           ('R-SIL-3','POOL-DIAG','long_tail','long_tail', date '2026-01-01'),
           ('R-SIL-4','POOL-DIAG','long_tail','long_tail', date '2026-01-01');

    insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status)
    values ('R-SIL-1', current_date, 100, 20, 'failed'),
           ('R-SIL-2', current_date, 100, 20, 'failed'),
           ('R-SIL-3', current_date, 100, 20, 'failed'),
           ('R-SIL-4', current_date, 100, 20, 'failed'),
           ('R-SIL-4', current_date, 999,  0, 'ok');   -- ok order: must NOT make a 5th affected

    insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
    values ('R-SIL-1:C1','R-SIL-1:conv1','POOL-DIAG','R-SIL-1','billing'),
           ('R-SIL-2:C1','R-SIL-2:conv1','POOL-DIAG','R-SIL-2','billing');
  `);
  const r = await pool.query<{ problem_id: string }>(`
    insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, criticality, status)
    values ('POOL-DIAG','R-SIL-1','critical','open')
    returning problem_id;
  `);
  return r.rows[0]!.problem_id;
}

beforeAll(async () => {
  pool = makePool();
}, 60_000);

// resetDb per-test: seedFixture re-inserts the same R-SIL-* PKs, so each test needs a clean slate.
beforeEach(async () => {
  await resetDb(pool);
});

afterAll(async () => {
  await pool.end();
});

describe("05B:B.5.2b — cazarSilenciosos (anti-join in SQL, counts equal, §14 no seed)", () => {
  it("anti-fake §14: Affected is EMPTY before cazarSilenciosos runs", async () => {
    const problemaId = await seedFixture();
    // No producer ran yet ⇒ zero Affected rows for this problema (rows are NEVER seeded).
    expect(await count(pool, `tenant."Affected" where problem_id='${problemaId}'`)).toBe(0);

    const out = await cazarSilenciosos(problemaId, "POOL-DIAG", VENTANA);

    // affected = every restaurant with a failed Order in window (the ok order adds none).
    expect(out.afetados).toBe(N_AFETADOS);
    // silent = affected WITHOUT a Conversation = N − M (the ⭐ hunt-silent count).
    expect(out.silenciosos).toBe(N_AFETADOS - M_RECLAMANTES);

    // The producer actually inserted the rows (counts are READ from the table, not invented).
    const af = await rows<{ restaurant_id: string; complained: boolean; silent: boolean }>(
      pool,
      `select restaurant_id, complained, silent from tenant."Affected"
         where problem_id = $1 order by restaurant_id`,
      [problemaId],
    );
    expect(af).toHaveLength(N_AFETADOS);
    // R-SIL-3 / R-SIL-4 are silent (no ticket); R-SIL-1 / R-SIL-2 complained.
    expect(af.filter((a) => a.silent).map((a) => a.restaurant_id)).toEqual(["R-SIL-3", "R-SIL-4"]);
    expect(af.filter((a) => a.complained).map((a) => a.restaurant_id)).toEqual(["R-SIL-1", "R-SIL-2"]);
  });

  it("idempotent re-run: counts stay equal (ON CONFLICT DO NOTHING, no double-count)", async () => {
    const problemaId = await seedFixture();
    await cazarSilenciosos(problemaId, "POOL-DIAG", VENTANA);
    const again = await cazarSilenciosos(problemaId, "POOL-DIAG", VENTANA);
    expect(again.afetados).toBe(N_AFETADOS); // count(*) is truth, not the inserted-row return.
    expect(again.silenciosos).toBe(N_AFETADOS - M_RECLAMANTES);
  });

  it("window from the knob when ventanaDias is omitted (BY NAME, §3.8)", async () => {
    const problemaId = await seedFixture();
    const out = await cazarSilenciosos(problemaId, "POOL-DIAG"); // no explicit window ⇒ reads knob.
    expect(out.afetados).toBe(N_AFETADOS);
    expect(out.silenciosos).toBe(N_AFETADOS - M_RECLAMANTES);
  });

  it("BR-B6 tenant scoping: a different tenant sees ZERO of POOL-DIAG's affected", async () => {
    const problemaId = await seedFixture();
    // Same problema, wrong tenant ⇒ the anti-join is scoped by p_tenant ⇒ no rows match.
    const out = await cazarSilenciosos(problemaId, "POOL-OTHER", VENTANA);
    expect(out.afetados).toBe(0);
    expect(out.silenciosos).toBe(0);
  });
});

describe("05B:US-B1.3.1 — reconcileAffected (live count + not_evaluable fail-closed)", () => {
  it("evaluable: restaurantsAffecteds = count(Affected), flag persisted", async () => {
    const problemaId = await seedFixture();
    await cazarSilenciosos(problemaId, "POOL-DIAG", VENTANA);

    const out = await reconcileAffected(problemaId);
    expect(out.restaurantsAffecteds).toBe(N_AFETADOS); // live count, NEVER a stored number.
    expect(out.silenciososEstado).toBe("evaluable"); // population (Order in window) exists.

    const persisted = await rows<{ silent_status: string | null }>(
      pool,
      `select silent_status from tenant."Diagnosed_Problem" where problem_id = $1`,
      [problemaId],
    );
    expect(persisted[0]?.silent_status).toBe("evaluable");
  });

  it("BR-B4 fail-closed: no population in window ⇒ not_evaluable (never assume zero)", async () => {
    // Dedicated tenant with a restaurant but NO Order ⇒ nothing observable in the window.
    await pool.query(`
      insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date)
      values ('R-EMPTY-1','POOL-EMPTY','long_tail','long_tail', date '2026-01-01');`);
    const r = await pool.query<{ problem_id: string }>(`
      insert into tenant."Diagnosed_Problem"(tenant_id, restaurant_id, criticality, status)
      values ('POOL-EMPTY','R-EMPTY-1','critical','open') returning problem_id;`);
    const problemaId = r.rows[0]!.problem_id;

    const out = await reconcileAffected(problemaId);
    expect(out.restaurantsAffecteds).toBe(0);
    expect(out.silenciososEstado).toBe("not_evaluable"); // fail-closed: zero is NOT asserted as fact.

    const persisted = await rows<{ silent_status: string | null }>(
      pool,
      `select silent_status from tenant."Diagnosed_Problem" where problem_id = $1`,
      [problemaId],
    );
    expect(persisted[0]?.silent_status).toBe("not_evaluable");
  });
});
