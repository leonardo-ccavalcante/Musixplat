import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, count, rows } from "../helpers/db";

// ── §14 ANTI-FAKE GATE (MASTER) ──────────────────────────────────────────────
// After seed (brutos only) and BEFORE any producer runs, every RESULT column must be
// NULL/empty. A seeded result number = fatal bug (CLAUDE.md §3.1). This test resets to the
// pristine post-seed state, then asserts. It is the FIRST gate (TDD: gate before producers).

let pool: pg.Pool;

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool); // brutos only, no producers
}, 120_000);

afterAll(async () => {
  await pool.end();
});

describe("§14 anti-fake — results are NULL/empty pre-run", () => {
  it("producer-output tables are EMPTY (cells/memberships/events/ROI)", async () => {
    expect(await count(pool, 'cohort."Cohort"')).toBe(0);
    expect(await count(pool, 'cohort."Subgrupo"')).toBe(0);
    expect(await count(pool, 'cohort."Pertenencia_Cohort_Snapshot"')).toBe(0);
    expect(await count(pool, 'cohort."Evento_Priorizado_NBA"')).toBe(0);
    expect(await count(pool, 'gov."ROI_Operador"')).toBe(0);
  });

  it("05B: diagnosis tables are EMPTY pre-run (Problema/Afetado/Knowledge_Case)", async () => {
    // Problemas are CREATED at runtime by the orchestrator; Afetado rows are PRODUCED by the
    // caza-silenciosos anti-join. Neither is ever seeded (§14, BR-B4). Knowledge_Case has no
    // producer this session ⇒ empty.
    expect(await count(pool, 'tenant."Problema_Diagnosticado"')).toBe(0);
    expect(await count(pool, 'tenant."Afetado"')).toBe(0);
    expect(await count(pool, 'tenant."Knowledge_Case"')).toBe(0);
  });

  it("in-place RESULT columns are NULL (tenure_actual, valor_hoy, capa_metricas)", async () => {
    expect(await count(pool, 'tenant."Restaurante" where tenure_actual is not null')).toBe(0);
    expect(await count(pool, 'tenant."KPI" where valor_hoy is not null')).toBe(0);
    expect(await count(pool, 'tenant."Conversa_Episodio" where capa_metricas is not null')).toBe(0);
  });

  it("BRUTOS are present (seed actually ran)", async () => {
    expect(await count(pool, 'tenant."Restaurante"')).toBe(100);
    expect(await count(pool, 'tenant."Orden"')).toBeGreaterThan(1000);
    expect(await count(pool, 'gov."Usuario"')).toBe(2);
    expect(await count(pool, 'catalog."Config_Perillas"')).toBeGreaterThan(0);
  });

  it("knobs are read BY NAME from Config_Perillas (k_anon=5, n_min=20)", async () => {
    const r = await rows<{ key: string; valor: string }>(
      pool,
      `select key, valor from catalog."Config_Perillas" where key in ('k_anon_threshold','n_min_threshold')`,
    );
    const map = Object.fromEntries(r.map((x) => [x.key, x.valor]));
    expect(map["k_anon_threshold"]).toBe("5");
    expect(map["n_min_threshold"]).toBe("20");
  });
});
