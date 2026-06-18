import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, count } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";
import { sellarMinCalculoConversa } from "../../server/conversa/min";

// 05A spine — A.1.1 (recv + server-side tenant + idempotent create) and A.4.6 (min() motor,
// conversa path + anti-fake). Hits the local DB via the tRPC caller, mirroring handoff.test.ts.

function caller(tenantId: string, userId: string) {
  const ctx: Context = {
    session: { usuario_id: userId, tenant_id: tenantId, nivel_org: "equipo" },
    tenantId,
    userId,
  };
  return appRouter.createCaller(ctx);
}

let pool: pg.Pool;

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool); // seed.sql seeds tenant."Restaurante" R001 (FK target for the conversa)
}, 60_000);

afterAll(async () => {
  await pool.end();
});

describe("05A:A.1.1 — recv + tenant server-side + create Conversa", () => {
  it("creates a conversa with tenant from the SESSION, not the body (anti-spoofing)", async () => {
    const out = await caller("POOL-001", "U-OP-001").conversa.recv({
      conversaId: "cv-1",
      restauranteId: "R001",
      canal: "whatsapp",
      turnos: [],
    });
    expect(out.tenant_id).toBe("POOL-001");
    expect(out.estado_conversa).toBe("abierta"); // never seeded 'escalada'/'resuelto'
    expect(await count(pool, `tenant."Conversa_Episodio" where conversa_id='cv-1'`)).toBe(1);
  });

  it("is idempotent on (tenant, conversa) — double recv ⇒ exactly one row", async () => {
    const a = await caller("POOL-001", "U-OP-001").conversa.recv({ conversaId: "cv-2", restauranteId: "R001", canal: "email", turnos: [] });
    const b = await caller("POOL-001", "U-OP-001").conversa.recv({ conversaId: "cv-2", restauranteId: "R001", canal: "email", turnos: [] });
    expect(b.episodio_id).toBe(a.episodio_id);
    expect(await count(pool, `tenant."Conversa_Episodio" where conversa_id='cv-2'`)).toBe(1);
  });

  it("rejects with no session (fail-closed tenant guard)", async () => {
    const anon = appRouter.createCaller({ session: null, tenantId: null, userId: null });
    await expect(
      anon.conversa.recv({ conversaId: "cv-x", restauranteId: "R001", canal: "in_app", turnos: [] }),
    ).rejects.toThrow();
  });
});

describe("05A:A.4.6 — min() motor (conversa path) + anti-fake", () => {
  it("anti-fake §14: min_calculo is empty before any motor call", async () => {
    expect(await count(pool, `gov."min_calculo"`)).toBe(0);
  });

  it("seals nivel_efectivo = least(arms) for the conversa path", async () => {
    const r = await sellarMinCalculoConversa({ conversaId: "cv-1", pedidoNBA: "ALTA", liberadoEvals: "MEDIA", tetoTier: "ALTA" });
    expect(r.nivelEfectivo).toBe("MEDIA");
    expect(await count(pool, `gov."min_calculo" where conversa_id='cv-1'`)).toBe(1);
  });

  it("a null/missing arm ⇒ BAJA (fail-closed)", async () => {
    const r = await sellarMinCalculoConversa({ conversaId: "cv-3", pedidoNBA: null, liberadoEvals: "ALTA", tetoTier: "ALTA" });
    expect(r.nivelEfectivo).toBe("BAJA");
  });
});
