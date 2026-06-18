import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, count, rows } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";
import { sealMinCalculationConversation } from "../../server/conversation/min";

// 05A spine — A.1.1 (recv + server-side tenant + idempotent create) and A.4.6 (min() engine,
// conversation path + anti-fake). Hits the local DB via the tRPC caller, mirroring handoff.test.ts.

function caller(tenantId: string, userId: string) {
  const ctx: Context = {
    session: { user_id: userId, tenant_id: tenantId, org_level: "team" },
    tenantId,
    userId,
  };
  return appRouter.createCaller(ctx);
}

let pool: pg.Pool;

beforeAll(async () => {
  pool = makePool();
  await resetDb(pool); // seed.sql seeds tenant."Restaurant" R001 (FK target for the conversation)
}, 60_000);

afterAll(async () => {
  await pool.end();
});

describe("05A:A.1.1 — recv + tenant server-side + create Conversation", () => {
  it("creates a conversation with tenant from the SESSION, not the body (anti-spoofing)", async () => {
    const out = await caller("POOL-001", "U-OP-001").conversation.recv({
      conversationId: "cv-1",
      restaurantId: "R001",
      channel: "whatsapp",
      turnos: [],
    });
    expect(out.tenant_id).toBe("POOL-001");
    expect(out.conversation_status).toBe("open"); // never seeded 'escalated'/'resolved'
    expect(await count(pool, `tenant."Conversation_Episode" where conversation_id='cv-1'`)).toBe(1);
  });

  it("is idempotent on (tenant, conversation) — double recv ⇒ exactly one row", async () => {
    const a = await caller("POOL-001", "U-OP-001").conversation.recv({ conversationId: "cv-2", restaurantId: "R001", channel: "email", turnos: [] });
    const b = await caller("POOL-001", "U-OP-001").conversation.recv({ conversationId: "cv-2", restaurantId: "R001", channel: "email", turnos: [] });
    expect(b.episode_id).toBe(a.episode_id);
    expect(await count(pool, `tenant."Conversation_Episode" where conversation_id='cv-2'`)).toBe(1);
  });

  it("rejects idempotency collision with a different same-tenant restaurant", async () => {
    const other = (await rows<{ restaurant_id: string }>(
      pool,
      `select restaurant_id from tenant."Restaurant" where tenant_id='POOL-001' and restaurant_id <> 'R001' order by restaurant_id limit 1`,
    ))[0]!;
    await caller("POOL-001", "U-OP-001").conversation.recv({ conversationId: "cv-restaurant-drift", restaurantId: "R001", channel: "email", turnos: [] });
    await expect(
      caller("POOL-001", "U-OP-001").conversation.recv({ conversationId: "cv-restaurant-drift", restaurantId: other.restaurant_id, channel: "email", turnos: [] }),
    ).rejects.toThrow(/another restaurant/i);
    expect(await count(pool, `tenant."Conversation_Episode" where conversation_id='cv-restaurant-drift'`)).toBe(1);
  });

  it("rejects cross-pool restaurant_id and writes Security_Log", async () => {
    await expect(
      caller("POOL-002", "U-OP-002").conversation.recv({ conversationId: "cv-cross", restaurantId: "R001", channel: "email", turnos: [] }),
    ).rejects.toThrow(/cross-pool/i);
    expect(await count(pool, `tenant."Conversation_Episode" where conversation_id='cv-cross'`)).toBe(0);
    expect(await count(pool, `gov."Security_Log" where kind='cross_pool'`)).toBeGreaterThan(0);
  });

  it("rejects with no session (fail-closed tenant guard)", async () => {
    const anon = appRouter.createCaller({ session: null, tenantId: null, userId: null });
    await expect(
      anon.conversation.recv({ conversationId: "cv-x", restaurantId: "R001", channel: "in_app", turnos: [] }),
    ).rejects.toThrow();
  });
});

describe("05A:A.4.6 — min() engine (conversation path) + anti-fake", () => {
  it("anti-fake §14: min_calculation is empty before any engine call", async () => {
    expect(await count(pool, `gov."min_calculation"`)).toBe(0);
  });

  it("seals effective_level = least(arms) for the conversation path", async () => {
    const episode = await caller("POOL-001", "U-OP-001").conversation.recv({
      conversationId: "cv-min-1",
      restaurantId: "R001",
      channel: "email",
      turnos: [],
    });
    const r = await sealMinCalculationConversation({ episodeId: episode.episode_id, nbaRequest: "HIGH", releasedEvals: "MEDIUM", tierCap: "HIGH" });
    expect(r.effectiveLevel).toBe("MEDIUM");
    expect(await count(pool, `gov."min_calculation" where episode_id='${episode.episode_id}'`)).toBe(1);
  });

  it("a null/missing arm ⇒ LOW (fail-closed)", async () => {
    const episode = await caller("POOL-001", "U-OP-001").conversation.recv({
      conversationId: "cv-min-2",
      restaurantId: "R001",
      channel: "email",
      turnos: [],
    });
    const r = await sealMinCalculationConversation({ episodeId: episode.episode_id, nbaRequest: null, releasedEvals: "HIGH", tierCap: "HIGH" });
    expect(r.effectiveLevel).toBe("LOW");
  });
});
