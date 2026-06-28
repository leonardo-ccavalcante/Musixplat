import { describe, it, expect, vi } from "vitest";
import { handleChatTurn, type ChatDeps, type Binding } from "./chat.js";

// Unit test of the agent loop with ALL side-effects faked (no DB, no LLM, no network). Proves the
// invariants that matter for §3/§7/§14:
//  - the owner's text is PII-redacted BEFORE it ever reaches the LLM or storage;
//  - identity is resolved server-side (bind only persists when the restaurant resolves to a tenant);
//  - on diagnose the engine is called via the injected caller and the number in the reply comes from
//    the SQL result (the agent never fabricates one);
//  - a money/uncertain turn and an unparseable model reply both fail-closed to a human handoff.

const RESOLVED = { tenantId: "POOL-X", userId: "U-1" };

function makeDeps(over: Partial<ChatDeps> & { chatResponses: string[] }): {
  deps: ChatDeps;
  chatCalls: { system: string; user: string }[];
  caller: { diagnosis: { reportProblem: ReturnType<typeof vi.fn>; run: ReturnType<typeof vi.fn> } };
  upsert: ReturnType<typeof vi.fn>;
  append: ReturnType<typeof vi.fn>;
} {
  const chatCalls: { system: string; user: string }[] = [];
  let i = 0;
  const responses = over.chatResponses;
  const caller = {
    diagnosis: {
      reportProblem: vi.fn(async () => ({ problem_id: "P-1", status: "open", frequency: 1, created: true })),
      run: vi.fn(async () => ({
        problem_id: "P-1",
        area_type: "finance",
        confidence: null,
        degraded: false,
        affected: 4,
        silent: 2,
        silent_status: "evaluable",
        revenue_lost: 320,
        route: "fix_internal",
        dossier_emitted: true,
        dossier_gaps: [],
      })),
    },
  };
  const upsert = vi.fn(async () => {});
  const append = vi.fn(async () => {});
  const deps: ChatDeps = {
    chat: async (system, user) => {
      chatCalls.push({ system, user });
      return responses[i++] ?? responses[responses.length - 1]!;
    },
    getBinding: over.getBinding ?? (async () => null),
    resolveRestaurant: over.resolveRestaurant ?? (async () => RESOLVED),
    upsertBinding: upsert,
    loadHistory: over.loadHistory ?? (async () => []),
    appendTurn: append,
    caller: () => caller as never,
  };
  return { deps, chatCalls, caller, upsert, append };
}

const bound: Binding = {
  channel: "telegram",
  external_id: "777",
  restaurant_id: "R-1",
  tenant_id: "POOL-X",
  user_id: "U-1",
};

describe("handleChatTurn — agent loop (faked deps)", () => {
  it("redacts PII before the text reaches the LLM", async () => {
    const { deps, chatCalls } = makeDeps({
      chatResponses: ['{"action":"ask","reply":"oi"}'],
    });
    await handleChatTurn({ channel: "telegram", externalId: "777", text: "meu email é joao@x.com" }, deps);
    expect(chatCalls[0]!.user).not.toContain("joao@x.com");
    expect(chatCalls[0]!.user).toContain("[REDACTED:email]");
  });

  it("residual PII (detector blind spot) → fail-closed handoff: no LLM, no engine, no raw persist", async () => {
    const { deps, chatCalls, caller, append } = makeDeps({
      getBinding: async () => bound,
      chatResponses: ['{"action":"ask","reply":"x"}'],
    });
    // 'a@b.c1' slips the email detector (TLD needs 2+ letters) but the independent residual net catches it.
    const out = await handleChatTurn({ channel: "telegram", externalId: "777", text: "manda pra a@b.c1" }, deps);
    expect(out.action).toBe("handoff");
    expect(chatCalls.length).toBe(0); // never reached the LLM
    expect(caller.diagnosis.run).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalled(); // a placeholder was stored, not the raw text
    expect(append.mock.calls[0]![1]).not.toContain("a@b.c1");
  });

  it("ask: returns the reply and persists the turn, no bind", async () => {
    const { deps, upsert, append } = makeDeps({ chatResponses: ['{"action":"ask","reply":"quando começou?"}'] });
    const out = await handleChatTurn({ channel: "telegram", externalId: "777", text: "vendas estranhas" }, deps);
    expect(out.reply).toBe("quando começou?");
    expect(upsert).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledOnce();
  });

  it("bind: persists ONLY when the restaurant resolves to a tenant (server-side)", async () => {
    const { deps, upsert } = makeDeps({
      chatResponses: ['{"action":"bind","restaurant_id":"R-1","reply":"achei seu restaurante"}'],
    });
    const out = await handleChatTurn({ channel: "telegram", externalId: "777", text: "é o id R-1" }, deps);
    expect(upsert).toHaveBeenCalledWith({
      channel: "telegram",
      external_id: "777",
      restaurant_id: "R-1",
      tenant_id: "POOL-X",
      user_id: "U-1",
    });
    expect(out.reply).toBe("achei seu restaurante");
  });

  it("bind unknown id: does NOT persist and replies a grounded not-found (no leak)", async () => {
    const { deps, upsert } = makeDeps({
      resolveRestaurant: async () => null,
      chatResponses: ['{"action":"bind","restaurant_id":"R-NOPE","reply":"achei"}', "Não encontrei esse id, pode conferir?"],
    });
    const out = await handleChatTurn({ channel: "telegram", externalId: "777", text: "id R-NOPE" }, deps);
    expect(upsert).not.toHaveBeenCalled();
    expect(out.reply).toContain("Não encontrei");
  });

  it("diagnose: runs the engine and the figure is rendered DETERMINISTICALLY from the SQL result (§14)", async () => {
    const { deps, caller, chatCalls } = makeDeps({
      getBinding: async () => bound,
      chatResponses: ['{"action":"diagnose","problem_type":"cancellation","reply":"vou checar"}'],
    });
    const out = await handleChatTurn({ channel: "telegram", externalId: "777", text: "muito cancelamento" }, deps);
    expect(caller.diagnosis.reportProblem).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantId: "R-1", problem_type: "cancellation" }),
    );
    expect(caller.diagnosis.run).toHaveBeenCalledWith({ problemId: "P-1" });
    expect(out.reply).toContain("4"); // affected — from SQL
    expect(out.reply).toContain("320"); // revenue_lost — from SQL
    expect(chatCalls.length).toBe(1); // ONLY the decision call — no LLM ever touches the number (§14)
  });

  it("diagnose degraded: honest can't-measure line with NO number (never fabricated, §14)", async () => {
    const { deps, caller } = makeDeps({
      getBinding: async () => bound,
      chatResponses: ['{"action":"diagnose","problem_type":"payment","reply":"vou ver"}'],
    });
    caller.diagnosis.run.mockResolvedValueOnce({
      problem_id: "P-1",
      area_type: "finance",
      confidence: null,
      degraded: true,
      affected: null,
      silent: null,
      silent_status: "not_evaluable",
      revenue_lost: null,
      route: "hand_to_team",
      dossier_emitted: false,
      dossier_gaps: ["impact"],
    });
    const out = await handleChatTurn({ channel: "telegram", externalId: "777", text: "pagamentos falhando" }, deps);
    expect(out.reply).not.toMatch(/\d/); // no number at all on the unmeasurable path
    expect(out.reply.toLowerCase()).toContain("pessoa"); // hands to a human
  });

  it("handoff: money/uncertain → returns the handoff reply", async () => {
    const { deps } = makeDeps({
      getBinding: async () => bound,
      chatResponses: ['{"action":"handoff","reply":"isso mexe com dinheiro, chamei uma pessoa"}'],
    });
    const out = await handleChatTurn({ channel: "telegram", externalId: "777", text: "meus repasses vieram errados" }, deps);
    expect(out.reply).toContain("pessoa");
  });

  it("unparseable model reply → fail-closed handoff (never guesses an action)", async () => {
    const { deps, caller, upsert } = makeDeps({
      getBinding: async () => bound,
      chatResponses: ["totally not json"],
    });
    const out = await handleChatTurn({ channel: "telegram", externalId: "777", text: "oi" }, deps);
    expect(out.action).toBe("handoff");
    expect(caller.diagnosis.run).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(out.reply.length).toBeGreaterThan(0);
  });
});
