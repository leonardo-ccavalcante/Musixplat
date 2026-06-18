import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, count, rows } from "../helpers/db";
import { cazarSilenciosos, reconcileAfetado } from "../../server/diagnostico/silenciosos";

// 05B:B.5.2b (caza-silenciosos) + US-B1.3.1 (reconcile). ⭐ the uau. The anti-join
// (Orden fallido ∖ Conversa-reclamantes) lives in SQL (tenant.fn_cazar_silenciosos); TS only
// orchestrates (§3.6). Anti-fake §14: Afetado is EMPTY pre-run — its rows are produced by the
// fn, never seeded. ventana via the 'ventana_silenciosos' knob BY NAME (§3.8). BR-B4 fail-closed:
// no observable population ⇒ no_evaluable, NEVER assume zero silenciosos. tenant scoping = BR-B6.
//
// Fixture lives in a DEDICATED tenant (POOL-DIAG) so the anti-join count is the EXACT controlled
// set, isolated from the seed's POOL-001 per-restaurante fallido noise. The spec's "47/35" is an
// illustrative scenario placeholder [C]; this proves the LOGIC with a small deterministic set.
//   N = 4 afetados   (each restaurante has ≥1 fallido Orden inside the window)
//   M = 2 reclamantes (have a Conversa_Episodio in the tenant ⇒ reclamou=true)
//   ⇒ silenciosos = N − M = 2  (afetado but with NO ticket — the silent ones we hunt)
const N_AFETADOS = 4;
const M_RECLAMANTES = 2;
const VENTANA = 30; // matches the seeded 'ventana_silenciosos' [C] knob; passed explicitly for determinism.

let pool: pg.Pool;

// 4 fixture restaurantes in POOL-DIAG. fecha = current_date (inside ANY positive window).
//   R-SIL-1: fallido + Conversa  → afetado, reclamou
//   R-SIL-2: fallido + Conversa  → afetado, reclamou
//   R-SIL-3: fallido, NO Conversa → afetado, SILENCIOSO
//   R-SIL-4: fallido + ok,  NO Conversa → afetado (only fallido drives it), SILENCIOSO
async function seedFixture(): Promise<string> {
  await pool.query(`
    insert into tenant."Restaurante"(restaurante_id, tenant_id, tier_base, segmento, fecha_alta)
    values ('R-SIL-1','POOL-DIAG','long_tail','long_tail', date '2026-01-01'),
           ('R-SIL-2','POOL-DIAG','long_tail','long_tail', date '2026-01-01'),
           ('R-SIL-3','POOL-DIAG','long_tail','long_tail', date '2026-01-01'),
           ('R-SIL-4','POOL-DIAG','long_tail','long_tail', date '2026-01-01');

    insert into tenant."Orden"(restaurante_id, fecha, valor_bruto, fee, status_pago)
    values ('R-SIL-1', current_date, 100, 20, 'fallido'),
           ('R-SIL-2', current_date, 100, 20, 'fallido'),
           ('R-SIL-3', current_date, 100, 20, 'fallido'),
           ('R-SIL-4', current_date, 100, 20, 'fallido'),
           ('R-SIL-4', current_date, 999,  0, 'ok');   -- ok order: must NOT make a 5th afetado

    insert into tenant."Conversa_Episodio"(episodio_id, conversa_id, tenant_id, restaurante_id, intent)
    values ('R-SIL-1:C1','R-SIL-1:conv1','POOL-DIAG','R-SIL-1','cobranca'),
           ('R-SIL-2:C1','R-SIL-2:conv1','POOL-DIAG','R-SIL-2','cobranca');
  `);
  const r = await pool.query<{ problema_id: string }>(`
    insert into tenant."Problema_Diagnosticado"(tenant_id, restaurante_id, criticidad, estado)
    values ('POOL-DIAG','R-SIL-1','grave','abierto')
    returning problema_id;
  `);
  return r.rows[0]!.problema_id;
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
  it("anti-fake §14: Afetado is EMPTY before cazarSilenciosos runs", async () => {
    const problemaId = await seedFixture();
    // No producer ran yet ⇒ zero Afetado rows for this problema (rows are NEVER seeded).
    expect(await count(pool, `tenant."Afetado" where problema_id='${problemaId}'`)).toBe(0);

    const out = await cazarSilenciosos(problemaId, "POOL-DIAG", VENTANA);

    // afetados = every restaurante with a fallido Orden in window (the ok order adds none).
    expect(out.afetados).toBe(N_AFETADOS);
    // silenciosos = afetados WITHOUT a Conversa = N − M (the ⭐ caza-silenciosos count).
    expect(out.silenciosos).toBe(N_AFETADOS - M_RECLAMANTES);

    // The producer actually inserted the rows (counts are READ from the table, not invented).
    const af = await rows<{ restaurante_id: string; reclamou: boolean; silencioso: boolean }>(
      pool,
      `select restaurante_id, reclamou, silencioso from tenant."Afetado"
         where problema_id = $1 order by restaurante_id`,
      [problemaId],
    );
    expect(af).toHaveLength(N_AFETADOS);
    // R-SIL-3 / R-SIL-4 are silencioso (no ticket); R-SIL-1 / R-SIL-2 reclamaram.
    expect(af.filter((a) => a.silencioso).map((a) => a.restaurante_id)).toEqual(["R-SIL-3", "R-SIL-4"]);
    expect(af.filter((a) => a.reclamou).map((a) => a.restaurante_id)).toEqual(["R-SIL-1", "R-SIL-2"]);
  });

  it("idempotent re-run: counts stay equal (ON CONFLICT DO NOTHING, no double-count)", async () => {
    const problemaId = await seedFixture();
    await cazarSilenciosos(problemaId, "POOL-DIAG", VENTANA);
    const again = await cazarSilenciosos(problemaId, "POOL-DIAG", VENTANA);
    expect(again.afetados).toBe(N_AFETADOS); // count(*) is truth, not the inserted-row return.
    expect(again.silenciosos).toBe(N_AFETADOS - M_RECLAMANTES);
  });

  it("ventana from the knob when ventanaDias is omitted (BY NAME, §3.8)", async () => {
    const problemaId = await seedFixture();
    const out = await cazarSilenciosos(problemaId, "POOL-DIAG"); // no explicit window ⇒ reads knob.
    expect(out.afetados).toBe(N_AFETADOS);
    expect(out.silenciosos).toBe(N_AFETADOS - M_RECLAMANTES);
  });

  it("BR-B6 tenant scoping: a different tenant sees ZERO of POOL-DIAG's afetados", async () => {
    const problemaId = await seedFixture();
    // Same problema, wrong tenant ⇒ the anti-join is scoped by p_tenant ⇒ no rows match.
    const out = await cazarSilenciosos(problemaId, "POOL-OTHER", VENTANA);
    expect(out.afetados).toBe(0);
    expect(out.silenciosos).toBe(0);
  });
});

describe("05B:US-B1.3.1 — reconcileAfetado (live count + no_evaluable fail-closed)", () => {
  it("evaluable: restaurantesAfetados = count(Afetado), flag persisted", async () => {
    const problemaId = await seedFixture();
    await cazarSilenciosos(problemaId, "POOL-DIAG", VENTANA);

    const out = await reconcileAfetado(problemaId);
    expect(out.restaurantesAfetados).toBe(N_AFETADOS); // live count, NEVER a stored number.
    expect(out.silenciososEstado).toBe("evaluable"); // population (Orden in window) exists.

    const persisted = await rows<{ silenciosos_estado: string | null }>(
      pool,
      `select silenciosos_estado from tenant."Problema_Diagnosticado" where problema_id = $1`,
      [problemaId],
    );
    expect(persisted[0]?.silenciosos_estado).toBe("evaluable");
  });

  it("BR-B4 fail-closed: no population in window ⇒ no_evaluable (never assume zero)", async () => {
    // Dedicated tenant with a restaurante but NO Orden ⇒ nothing observable in the window.
    await pool.query(`
      insert into tenant."Restaurante"(restaurante_id, tenant_id, tier_base, segmento, fecha_alta)
      values ('R-EMPTY-1','POOL-EMPTY','long_tail','long_tail', date '2026-01-01');`);
    const r = await pool.query<{ problema_id: string }>(`
      insert into tenant."Problema_Diagnosticado"(tenant_id, restaurante_id, criticidad, estado)
      values ('POOL-EMPTY','R-EMPTY-1','grave','abierto') returning problema_id;`);
    const problemaId = r.rows[0]!.problema_id;

    const out = await reconcileAfetado(problemaId);
    expect(out.restaurantesAfetados).toBe(0);
    expect(out.silenciososEstado).toBe("no_evaluable"); // fail-closed: zero is NOT asserted as fact.

    const persisted = await rows<{ silenciosos_estado: string | null }>(
      pool,
      `select silenciosos_estado from tenant."Problema_Diagnosticado" where problema_id = $1`,
      [problemaId],
    );
    expect(persisted[0]?.silenciosos_estado).toBe("no_evaluable");
  });
});
