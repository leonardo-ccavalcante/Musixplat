import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, count, rows } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";

// Situation Room — the spine runs on OPERATOR-UPLOADED data, not the fixed 47/35 (Leo: "se não vou estar
// fakeando"). uploadTickets stages restaurants/orders/episodes from the rows, then runs the orchestrator:
// affected/silent/€ are PRODUCED by fn_hunt_silent + fn_impact FROM the upload (§14), never seeded.
// uploadConversations ingests the n8n chat-history shape into Conversation_Episode (the real DB structure).
const POOL = "POOL-UP";
function caller(userId = "U-UP-OP") {
  const ctx: Context = {
    session: { user_id: userId, tenant_id: POOL, org_level: "team" },
    tenantId: POOL,
    userId,
  };
  return appRouter.createCaller(ctx);
}

let pool: pg.Pool;
beforeAll(async () => {
  pool = makePool();
  await resetDb(pool);
  // operator + an independent AI proposer (4-eyes) for the upload pool
  await pool.query(
    `insert into gov."User"(user_id, tenant_id, org_level, role) values
       ('U-UP-OP',$1,'team','agent_manager_senior'),('U-UP-AI',$1,'team','ai_agent')
     on conflict (user_id) do nothing`,
    [POOL],
  );
}, 60_000);
afterAll(async () => {
  await pool.end();
});

describe("Situation Room intake — spine runs on uploaded data", () => {
  it("uploadTickets PRODUCES the cascade from the rows (affected/silent derive from YOUR file)", async () => {
    const res = await caller().intake.uploadTickets({
      rows: [
        { restaurant_id: "UP-1", zone: "Centro", payment_status: "failed", opened_ticket: true, intent: "billing", criticality: "critical", message: "my payout never arrived" },
        { restaurant_id: "UP-2", zone: "Centro", payment_status: "failed", opened_ticket: false },
        { restaurant_id: "UP-3", zone: "Norte", payment_status: "failed", opened_ticket: false },
        { restaurant_id: "UP-4", zone: "Norte", payment_status: "ok", opened_ticket: false },
      ],
    });
    expect(res.staged).toBe(4);
    expect(res.affected).toBe(3); // 3 failed payments in the upload
    expect(res.silent).toBe(2); // 2 of those never opened a ticket
    expect(res.revenue_lost).toBeGreaterThan(0);
    expect(res.affected).not.toBe(47); // NOT the canned scenario — it came from the file
    const list = await caller().diagnosis.list();
    expect(list.length).toBeGreaterThan(0);
  }, 60_000);

  it("uploadTickets is idempotent — a re-upload REPLACES the pool, never accumulates", async () => {
    const res = await caller().intake.uploadTickets({
      rows: [
        { restaurant_id: "UP-9", zone: "Centro", payment_status: "failed", opened_ticket: true, intent: "billing", criticality: "critical", message: "x" },
        { restaurant_id: "UP-10", zone: "Centro", payment_status: "failed", opened_ticket: false },
      ],
    });
    expect(res.affected).toBe(2);
    expect(await count(pool, `tenant."Restaurant" where tenant_id='${POOL}'`)).toBe(2); // replaced (not 6)
  }, 60_000);

  it("uploadConversations ingests the n8n format into Conversation_Episode (turnos carry the real chat)", async () => {
    const res = await caller().intake.uploadConversations({
      conversations: [
        { session_id: "56995726208", intent: "support", turns: [{ role: "restaurant", text: "hola" }, { role: "agent", text: "hola! como ayudo?" }] },
        { session_id: "56977787393", intent: "support", turns: [{ role: "restaurant", text: "tengo un problema" }] },
      ],
    });
    expect(res.staged).toBe(2);
    expect(await count(pool, `tenant."Conversation_Episode" where tenant_id='${POOL}'`)).toBe(2);
    const ep = await rows<{ turnos: unknown }>(
      pool,
      `select turnos from tenant."Conversation_Episode" where tenant_id='${POOL}' order by episode_id limit 1`,
    );
    expect(Array.isArray(ep[0]!.turnos)).toBe(true);
  }, 60_000);
});
