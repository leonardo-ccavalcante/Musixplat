import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, rows } from "../helpers/db";
import { upsertCasoRepo } from "../../server/diagnostico/caso_repo";

// 05B:US-B6.2.1 — upsertCasoRepo (BR-B15 replicable case, BR-B7 PII redaction, §14 anti-fake).
// Unit-of-record test against the local DB: a Problema is inserted directly (its RESULT columns
// stay NULL — caso_repo NULL pre-run), then the producer fills/increments. PII in cliente_id
// must be redacted in the stored jsonb. Modeled on diagnostico_spine.test.ts.

let pool: pg.Pool;
let problemaId: string;

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool); // seeds R001 in POOL-001
  // Insert the Problema brute (no producers): caso_repo + frecuencia default per DDL.
  const inserted = await rows<{ problema_id: string }>(
    pool,
    `insert into tenant."Problema_Diagnosticado"(tenant_id, restaurante_id, criticidad)
       values ('POOL-001', 'R001', 'grave') returning problema_id`,
  );
  problemaId = inserted[0]!.problema_id;
}, 60_000);

afterAll(async () => {
  await pool.end();
});

describe("05B:US-B6.2.1 — upsertCasoRepo create-or-increment + PII redaction", () => {
  it("anti-fake §14: caso_repo is NULL pre-run (only the producer fills it)", async () => {
    const r = await rows<{ caso_repo: unknown }>(
      pool,
      `select caso_repo from tenant."Problema_Diagnosticado" where problema_id = $1`,
      [problemaId],
    );
    expect(r[0]!.caso_repo).toBeNull();
  });

  it("first call creates the case (created=true, frecuencia unchanged) + redacts PII", async () => {
    const out = await upsertCasoRepo(problemaId, {
      cliente_id: "cliente joao joao.silva@example.com",
      dia: "2026-06-17",
      links_replicaveis: ["repro-step-1"],
      onde_concentra: { zona: "centro" },
    });
    expect(out.created).toBe(true);
    expect(out.frecuencia).toBe(1); // unchanged from the DDL default

    const r = await rows<{ caso_repo: { cliente_id: string }; ultima_vez_ts: string | null }>(
      pool,
      `select caso_repo, ultima_vez_ts from tenant."Problema_Diagnosticado" where problema_id = $1`,
      [problemaId],
    );
    expect(r[0]!.caso_repo).not.toBeNull(); // now set
    expect(r[0]!.ultima_vez_ts).not.toBeNull(); // bumped
    // BR-B7: the PII-bearing email in cliente_id is redacted in the STORED jsonb.
    expect(r[0]!.caso_repo.cliente_id).toBe("cliente joao [REDACTED:email]");
    expect(r[0]!.caso_repo.cliente_id).not.toContain("@example.com");
  });

  it("second call increments frecuencia (created=false) — frecuencia is a computed count", async () => {
    const out = await upsertCasoRepo(problemaId, { cliente_id: "cliente-anon", dia: "2026-06-18" });
    expect(out.created).toBe(false); // BR-B15: existing case, no duplicate
    expect(out.frecuencia).toBe(2); // incremented in SQL, read via RETURNING

    const r = await rows<{ frecuencia: number }>(
      pool,
      `select frecuencia from tenant."Problema_Diagnosticado" where problema_id = $1`,
      [problemaId],
    );
    expect(r[0]!.frecuencia).toBe(2);
  });
});
