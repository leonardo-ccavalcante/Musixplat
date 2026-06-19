import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb, count, rows } from "../helpers/db";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";
import type { TicketRowInput } from "../../shared/contracts_intake";

// Situation Room — the spine runs on OPERATOR-UPLOADED data, not the fixed 47/35 (Leo: "se não vou estar
// fakeando"). uploadTickets stages restaurants/orders/episodes from the rows, then runs the orchestrator:
// affected/silent/€ are PRODUCED by fn_hunt_silent + fn_impact FROM the upload (§14), never seeded.
// uploadConversations ingests the n8n chat-history shape into Conversation_Episode (the real DB structure).
const POOL = "POOL-UP";
function caller(userId = "U-UP-OP", tenantId = POOL) {
  const ctx: Context = {
    session: { user_id: userId, tenant_id: tenantId, org_level: "team" },
    tenantId,
    userId,
  };
  return appRouter.createCaller(ctx);
}

function ticket(restaurantId: string, overrides: Partial<TicketRowInput> = {}): TicketRowInput {
  return {
    restaurant_id: restaurantId,
    zone: "Centro",
    payment_status: "failed",
    order_date: "2026-06-18",
    gross_value: 100,
    fee: 20,
    opened_ticket: false,
    ...overrides,
  };
}

let pool: pg.Pool;
beforeAll(async () => {
  pool = makePool();
}, 60_000);
beforeEach(async () => {
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
        ticket("UP-1", { gross_value: 200, fee: 20, opened_ticket: true, intent: "billing", criticality: "critical", message: "my payout never arrived" }),
        ticket("UP-2", { gross_value: 100, fee: 10 }),
        ticket("UP-3", { zone: "Norte", gross_value: 50, fee: 5 }),
        ticket("UP-4", { zone: "Norte", payment_status: "ok" }),
      ],
    });
    expect(res.staged).toBe(4);
    expect(res.affected).toBe(3); // 3 failed payments in the upload
    expect(res.silent).toBe(2); // 2 of those never opened a ticket
    expect(res.revenue_lost).toBe(315); // sum of uploaded net values, never a server-side placeholder
    expect(res.affected).not.toBe(47); // NOT the canned scenario — it came from the file
    const list = await caller().diagnosis.list();
    expect(list.length).toBeGreaterThan(0);
  }, 60_000);

  it("uploadTickets is idempotent — a re-upload REPLACES the pool, never accumulates", async () => {
    const res = await caller().intake.uploadTickets({
      rows: [
        ticket("UP-9", { opened_ticket: true, intent: "billing", criticality: "critical", message: "x" }),
        ticket("UP-10"),
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
    const ep = await rows<{ episode_id: string; conversation_id: string; turnos: unknown }>(
      pool,
      `select episode_id, conversation_id, turnos
         from tenant."Conversation_Episode" where tenant_id='${POOL}' order by episode_id limit 1`,
    );
    expect(Array.isArray(ep[0]!.turnos)).toBe(true);
    expect(JSON.stringify(ep)).not.toContain("56995726208");
    expect(JSON.stringify(ep)).not.toContain("56977787393");
  }, 60_000);

  it("redacts PII before persisting any uploaded turn", async () => {
    await caller().intake.uploadTickets({
      rows: [
        ticket("UP-PII", {
          opened_ticket: true,
          intent: "billing",
          criticality: "critical",
          message: "email jane@example.com or call +34 612 345 678",
        }),
      ],
    });
    const ep = await rows<{ turnos: unknown; transcript_layer: { pii_redacted?: boolean; pii_types?: string[] } }>(
      pool,
      `select turnos, transcript_layer from tenant."Conversation_Episode" where tenant_id=$1`,
      [POOL],
    );
    const stored = JSON.stringify(ep[0]!.turnos);
    expect(stored).not.toContain("jane@example.com");
    expect(stored).not.toContain("612 345 678");
    expect(stored).toContain("[REDACTED:email]");
    expect(ep[0]!.transcript_layer.pii_redacted).toBe(true);
    expect(ep[0]!.transcript_layer.pii_types).toEqual(expect.arrayContaining(["email", "phone"]));
  }, 60_000);

  it("blocks a cross-pool restaurant id and rolls the tenant replacement back", async () => {
    await caller().intake.uploadTickets({ rows: [ticket("UP-SURVIVES")] });
    await pool.query(
      `insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
       values ('FOREIGN-ID','POOL-FOREIGN','long_tail','long_tail',current_date,'Norte')`,
    );

    await expect(caller().intake.uploadTickets({ rows: [ticket("FOREIGN-ID")] })).rejects.toThrow(
      "cross-pool restaurant upload blocked",
    );

    expect(await count(pool, `tenant."Restaurant" where restaurant_id='UP-SURVIVES' and tenant_id='${POOL}'`)).toBe(1);
    expect(await count(pool, `tenant."Restaurant" where restaurant_id='FOREIGN-ID' and tenant_id='POOL-FOREIGN'`)).toBe(1);
    expect(await count(pool, `gov."Security_Log" where tenant_id='${POOL}' and kind='cross_pool'`)).toBeGreaterThan(0);
  }, 60_000);

  it("replacing one pool preserves another pool's decided artifact and audit", async () => {
    const other = "POOL-OTHER-UP";
    await pool.query(
      `insert into gov."User"(user_id, tenant_id, org_level, role) values
         ('U-OTHER-OP',$1,'team','agent_manager_senior'),('U-OTHER-AI',$1,'team','ai_agent')`,
      [other],
    );
    const seeded = await caller("U-OTHER-OP", other).intake.uploadTickets({
      rows: [
        ticket("OTHER-1", {
          opened_ticket: true,
          intent: "billing",
          criticality: "critical",
          resolution_how: "reviewed gateway retry",
        }),
        ticket("OTHER-2"),
        ticket("OTHER-3", { zone: "Norte" }),
      ],
    });
    expect(seeded.artifacts).toBe(1);
    const artifact = (await caller("U-OTHER-OP", other).artifact.list())[0]!;
    await caller("U-OTHER-OP", other).artifact.decide({ artifactId: artifact.artifact_id, action: "approve" });

    await caller().intake.uploadTickets({ rows: [ticket("UP-NEW")] });

    expect(await count(pool, `gov."Generated_Artifact" where artifact_id='${artifact.artifact_id}' and superseded_at is null`)).toBe(1);
    expect(await count(pool, `gov."Artifact_Decision" where artifact_id='${artifact.artifact_id}'`)).toBe(1);
  }, 60_000);
});
