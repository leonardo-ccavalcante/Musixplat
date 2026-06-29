import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type pg from "pg";
import { makePool, resetDb } from "../helpers/db";
import { query } from "../../server/db/pool";
import { appRouter } from "../../server/routers/_app";
import type { Context } from "../../server/_core/context";
import { handleChatTurn, type ChatDeps, type EngineCaller } from "../../server/agent/chat";
import { getBinding, resolveRestaurant, upsertBinding } from "../../server/agent/identity";
import { loadHistory, appendTurn } from "../../server/agent/memory";
import { scanSignals, restaurantAtRisk } from "../../server/agent/signals";
import { writeChatCase } from "../../server/agent/knowledge";

// Agent chat gateway (Fatia 1) end-to-end against the real DB, with a FAKE chat (no OpenAI/network).
// Proves the load-bearing invariants:
//  - bind resolves the tenant SERVER-SIDE from the restaurant id (anti-spoofing §7); the channel never
//    supplies tenant_id, and an unknown id binds NOTHING (no leak);
//  - diagnose reuses the real diagnosis procedures via createCaller and the narrated figure is the
//    PRODUCED SQL number (never fabricated, §14);
//  - the human + ai turn is persisted (already redacted) in the n8n_chat_histories shape.

// Same fixture as diagnosis_run: 4 failed-payment restaurants in POOL-RUN, 2 complainants ⇒ affected 4 /
// silent 2 / €320 — PLUS a POOL-RUN user so the binding can resolve a ctx user server-side.
async function seedPool(pool: pg.Pool): Promise<void> {
  await pool.query(`
    insert into gov."User"(user_id, tenant_id, org_level, role)
      values ('U-RUN', 'POOL-RUN', 'team', 'agent_manager_senior');
    insert into tenant."Restaurant"(restaurant_id, tenant_id, tier_base, segment, signup_date, zone)
      values ('R-RUN-1','POOL-RUN','long_tail','long_tail', date '2026-01-01','Centro'),
             ('R-RUN-2','POOL-RUN','long_tail','long_tail', date '2026-01-01','Centro'),
             ('R-RUN-3','POOL-RUN','long_tail','long_tail', date '2026-01-01','Centro'),
             ('R-RUN-4','POOL-RUN','long_tail','long_tail', date '2026-01-01','Norte');
    insert into tenant."Order"(restaurant_id, order_date, gross_value, fee, payment_status, zone)
      values ('R-RUN-1', current_date, 100, 20, 'failed','Centro'),
             ('R-RUN-2', current_date, 100, 20, 'failed','Centro'),
             ('R-RUN-3', current_date, 100, 20, 'failed','Centro'),
             ('R-RUN-4', current_date, 100, 20, 'failed','Norte');
    insert into tenant."Conversation_Episode"(episode_id, conversation_id, tenant_id, restaurant_id, intent)
      values ('R-RUN-1:C1','R-RUN-1:conv1','POOL-RUN','R-RUN-1','billing'),
             ('R-RUN-2:C1','R-RUN-2:conv1','POOL-RUN','R-RUN-2','billing');
  `);
}

// deps wired to the REAL db + real engine caller; only the LLM is faked (scripted replies).
function makeDeps(chatResponses: string[]): ChatDeps {
  let i = 0;
  return {
    chat: async () => chatResponses[i++] ?? chatResponses[chatResponses.length - 1]!,
    getBinding: (c, e) => getBinding(query, c, e),
    scanSignals: (rid) => scanSignals(query, rid),
    restaurantAtRisk: (rid, pt) => restaurantAtRisk(query, rid, pt),
    recordCase: (tid, area, pattern) => writeChatCase(query, tid, area, pattern),
    resolveRestaurant: (rid) => resolveRestaurant(query, rid),
    upsertBinding: (b) => upsertBinding(query, b),
    loadHistory: (s) => loadHistory(query, s),
    appendTurn: (s, h, a, t) => appendTurn(query, s, h, a, t),
    caller: (ctx: Context): EngineCaller => {
      const c = appRouter.createCaller(ctx);
      return { diagnosis: { reportProblem: (x) => c.diagnosis.reportProblem(x), run: (x) => c.diagnosis.run(x) } };
    },
  };
}

let pool: pg.Pool;
beforeAll(async () => {
  pool = makePool();
}, 60_000);
beforeEach(async () => {
  await resetDb(pool);
  // resetDb's truncate list doesn't include the agent infra tables — clear them for per-test isolation.
  await pool.query(`delete from gov."Channel_Identity"; delete from gov.n8n_chat_histories;`);
  await seedPool(pool);
});
afterAll(async () => {
  await pool.end();
});

describe("agent chat gateway — bind + diagnose E2E (real DB, faked LLM)", () => {
  it("bind resolves the tenant server-side from the restaurant id (never the channel)", async () => {
    const deps = makeDeps(['{"action":"bind","restaurant_id":"R-RUN-1","reply":"achei seu restaurante"}']);
    const out = await handleChatTurn({ channel: "telegram", externalId: "555", text: "é o id R-RUN-1" }, deps);
    expect(out.action).toBe("bind");
    const b = await pool.query<{ tenant_id: string; user_id: string }>(
      `select tenant_id, user_id from gov."Channel_Identity" where channel='telegram' and external_id='555'`,
    );
    expect(b.rows[0]?.tenant_id).toBe("POOL-RUN"); // resolved server-side, not supplied by the caller
    expect(b.rows[0]?.user_id).toBe("U-RUN");
  });

  it("the engine FINDS the signal: fn_restaurant_signals surfaces payment for a restaurant with failed orders", async () => {
    const sig = await scanSignals(query, "R-RUN-1");
    expect(sig.map((s) => s.problem_type)).toContain("payment"); // real failed orders → real signal (not a guess)
  });

  it("fn_restaurant_signals emits NO phantom signal for an unknown restaurant", async () => {
    const sig = await scanSignals(query, "R-DOES-NOT-EXIST");
    expect(sig).toHaveLength(0); // 'no usage' is vacuously true for an unknown id — guarded out
  });

  it("unknown restaurant id binds NOTHING (no leak)", async () => {
    const deps = makeDeps([
      '{"action":"bind","restaurant_id":"R-NOPE","reply":"achei"}',
      "Não encontrei esse id, pode conferir?",
    ]);
    await handleChatTurn({ channel: "telegram", externalId: "556", text: "id R-NOPE" }, deps);
    const b = await pool.query(`select 1 from gov."Channel_Identity" where external_id='556'`);
    expect(b.rowCount).toBe(0);
  });

  it("diagnose runs the real engine and narrates the PER-RESTAURANT figure (€80, not the pool €320), persisting the turn", async () => {
    // pre-bind R-RUN-1
    await upsertBinding(query, {
      channel: "telegram",
      external_id: "777",
      restaurant_id: "R-RUN-1",
      tenant_id: "POOL-RUN",
      user_id: "U-RUN",
    });
    const deps = makeDeps([
      '{"action":"diagnose","problem_type":"payment","reply":"vou checar"}',
      "Vejo que pagamentos podem estar te custando [[FIG]]. Já registrei pra acompanhar. Quer seguir?",
    ]);
    const out = await handleChatTurn({ channel: "telegram", externalId: "777", text: "meus pagamentos falham" }, deps);
    expect(out.action).toBe("diagnose");
    expect(out.reply).toContain("€80"); // R-RUN-1's OWN at-risk (one failed order, net 80) — per-restaurant
    expect(out.reply).not.toContain("320"); // NOT the pool-wide revenue_lost (the wrong-value bug Leo caught)
    // the engine actually ran against the real DB:
    const pr = await pool.query<{ n: number }>(
      `select count(*)::int n from tenant."Diagnosed_Problem" where tenant_id='POOL-RUN'`,
    );
    expect(pr.rows[0]!.n).toBe(1);
    const af = await pool.query<{ n: number }>(`select count(*)::int n from tenant."Affected"`);
    expect(af.rows[0]!.n).toBe(4); // produced by fn_hunt_silent
    // the turn was persisted in the n8n_chat_histories shape (human + ai):
    const hist = await pool.query<{ n: number; tenant_id: string | null }>(
      `select count(*)::int n, max(tenant_id) tenant_id from gov.n8n_chat_histories where session_id='telegram:777'`,
    );
    expect(hist.rows[0]!.n).toBe(2); // composite session key (channel:external_id)
    expect(hist.rows[0]!.tenant_id).toBe("POOL-RUN"); // tenant carried best-effort for future RLS
    // the conversation became a Knowledge_Case (reviewed=false) — the chat's learning contribution
    const kc = await pool.query<{ n: number }>(
      `select count(*)::int n from tenant."Knowledge_Case"
        where tenant_id='POOL-RUN' and reviewed=false and pattern like 'chat:%'`,
    );
    expect(kc.rows[0]!.n).toBe(1);
  });
});
