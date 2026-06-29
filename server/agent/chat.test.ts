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
// Default: every type has signal, so existing diagnose tests aren't blocked by the signal gate.
const ALL_SIGNALS = [
  { problem_type: "payment", direction: "above" },
  { problem_type: "connection", direction: "below" },
  { problem_type: "cancellation", direction: "above" },
  { problem_type: "menu_quality", direction: "below" },
  { problem_type: "adoption", direction: "below" },
];

function makeDeps(over: Partial<ChatDeps> & { chatResponses: string[] }): {
  deps: ChatDeps;
  chatCalls: { system: string; user: string }[];
  caller: { diagnosis: { reportProblem: ReturnType<typeof vi.fn>; run: ReturnType<typeof vi.fn> } };
  upsert: ReturnType<typeof vi.fn>;
  append: ReturnType<typeof vi.fn>;
  recordCase: ReturnType<typeof vi.fn>;
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
  const recordCase = vi.fn(async () => {});
  const deps: ChatDeps = {
    chat: async (system, user) => {
      chatCalls.push({ system, user });
      return responses[i++] ?? responses[responses.length - 1]!;
    },
    getBinding: over.getBinding ?? (async () => null),
    scanSignals: over.scanSignals ?? (async () => ALL_SIGNALS),
    restaurantAtRisk: over.restaurantAtRisk ?? (async () => 80), // this restaurant's OWN figure (not pool 320)
    recordCase: over.recordCase ?? recordCase,
    resolveRestaurant: over.resolveRestaurant ?? (async () => RESOLVED),
    upsertBinding: upsert,
    loadHistory: over.loadHistory ?? (async () => []),
    appendTurn: append,
    caller: () => caller as never,
  };
  return { deps, chatCalls, caller, upsert, append, recordCase };
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

  it("NEVER lets an async-stalling reply reach the owner — replaced by an honest, immediate one (code guard)", async () => {
    const { deps } = makeDeps({
      getBinding: async () => bound,
      scanSignals: async () => [{ problem_type: "connection", direction: "below" }],
      // the exact failure from the transcript: an 'ask' that promises a future analysis
      chatResponses: ['{"action":"ask","reply":"Entendi, vou verificar como você usa a plataforma. Um momento!"}'],
    });
    const out = await handleChatTurn({ channel: "telegram", externalId: "777", text: "como melhorar meus ingressos?" }, deps);
    expect(out.reply.toLowerCase()).not.toMatch(/um momento|vou verificar|analisando|aguarde/);
    expect(out.reply).toContain("connection"); // forward-moving: names what it CAN measure right now
  });

  it("a normal (non-stalling) reply passes through unchanged", async () => {
    const { deps } = makeDeps({
      getBinding: async () => bound,
      chatResponses: ['{"action":"ask","reply":"Quando você começou a notar isso?"}'],
    });
    const out = await handleChatTurn({ channel: "telegram", externalId: "777", text: "tá estranho" }, deps);
    expect(out.reply).toBe("Quando você começou a notar isso?");
  });

  it("catches an EN stall too ('I'll check and get back to you')", async () => {
    const { deps } = makeDeps({
      getBinding: async () => bound,
      scanSignals: async () => [{ problem_type: "connection", direction: "below" }],
      chatResponses: ['{"action":"ask","reply":"Got it. I will check and get back to you."}'],
    });
    const out = await handleChatTurn({ channel: "telegram", externalId: "777", text: "something is off" }, deps);
    expect(out.reply.toLowerCase()).not.toContain("get back to you");
    expect(out.reply).toContain("connection");
  });

  it("unbound + stall → asks for the restaurant id (never a 'measured nothing' claim)", async () => {
    const { deps } = makeDeps({
      getBinding: async () => null, // not linked
      chatResponses: ['{"action":"ask","reply":"Vou verificar, um momento!"}'],
    });
    const out = await handleChatTurn({ channel: "telegram", externalId: "777", text: "oi" }, deps);
    expect(out.reply.toLowerCase()).not.toMatch(/um momento|vou verificar/);
    expect(out.reply.toLowerCase()).toContain("id"); // asks for the restaurant id instead
  });

  it("a money narration that ALSO stalls is rejected → deterministic €, no stall (§14 + sync)", async () => {
    const { deps } = makeDeps({
      getBinding: async () => bound,
      chatResponses: [
        '{"action":"diagnose","problem_type":"payment","reply":"vou ver"}',
        "Vejo [[FIG]] em risco. Vou verificar mais detalhes e te aviso.", // a real figure BUT also a stall
      ],
    });
    const out = await handleChatTurn({ channel: "telegram", externalId: "777", text: "pagamentos falhando" }, deps);
    expect(out.reply).toContain("€80");
    expect(out.reply.toLowerCase()).not.toMatch(/vou verificar|te aviso/);
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

  it("diagnose: € figure is rendered by CODE from SQL; the LLM only frames it (verbatim guard, §14)", async () => {
    const { deps, caller } = makeDeps({
      getBinding: async () => bound,
      chatResponses: [
        '{"action":"diagnose","problem_type":"cancellation","reply":"vou checar"}',
        "Vejo que cancelamentos podem estar te custando [[FIG]]. Já registrei pra acompanhar. Quer seguir?",
      ],
    });
    const out = await handleChatTurn({ channel: "telegram", externalId: "777", text: "muito cancelamento" }, deps);
    expect(caller.diagnosis.reportProblem).toHaveBeenCalledWith(
      expect.objectContaining({ restaurantId: "R-1", problem_type: "cancellation" }),
    );
    expect(out.reply).toContain("€80"); // THIS restaurant's own at-risk, injected at [[FIG]]
    expect(out.reply).not.toContain("320"); // NOT the pool-wide revenue_lost (the wrong-value bug)
    expect(out.reply).not.toContain("[[FIG]]"); // placeholder fully replaced
  });

  it("diagnose: model writes its OWN wrong number → rejected; only the SQL € reaches the owner (§14)", async () => {
    const { deps } = makeDeps({
      getBinding: async () => bound,
      chatResponses: [
        '{"action":"diagnose","problem_type":"payment","reply":"vou ver"}',
        "Você está perdendo €3200 agora, é grave. Quer ajuda?", // model fabricated a different figure
      ],
    });
    const out = await handleChatTurn({ channel: "telegram", externalId: "777", text: "pagamentos falhando" }, deps);
    expect(out.reply).toContain("€80"); // the real per-restaurant SQL figure
    expect(out.reply).not.toContain("€3200"); // the fabricated one never reaches the owner
  });

  it("diagnose: model sneaks a stray digit alongside the placeholder → rejected (§14)", async () => {
    const { deps } = makeDeps({
      getBinding: async () => bound,
      chatResponses: [
        '{"action":"diagnose","problem_type":"payment","reply":"vou ver"}',
        "Perdi uns 50 pedidos, risco de [[FIG]]", // a digit the model wrote itself
      ],
    });
    const out = await handleChatTurn({ channel: "telegram", externalId: "777", text: "pagamentos falhando" }, deps);
    expect(out.reply).toContain("€80");
    expect(out.reply).not.toContain("50"); // the model's stray number was discarded with its whole text
  });

  it("non-money type (adoption) → finding + plan with NO number at all", async () => {
    const { deps, caller } = makeDeps({
      getBinding: async () => bound,
      scanSignals: async () => [{ problem_type: "adoption", direction: "below" }],
      restaurantAtRisk: async () => 0, // adoption has no honest per-restaurant money figure
      chatResponses: [
        '{"action":"diagnose","problem_type":"adoption","reply":"vou ver seu uso"}',
        "Vejo que dá pra usar melhor a plataforma pra vender mais. Já registrei e vou cuidar. Quer ajuda?",
      ],
    });
    const out = await handleChatTurn({ channel: "telegram", externalId: "777", text: "quero vender mais" }, deps);
    expect(caller.diagnosis.run).toHaveBeenCalled(); // it DID diagnose adoption
    expect(out.reply).not.toMatch(/\d/); // but shows NO number (no fake money for a non-money problem)
  });

  it("diagnose on a NEW problem → records a Knowledge_Case (the chat's learning contribution)", async () => {
    const { deps, recordCase } = makeDeps({
      getBinding: async () => bound,
      chatResponses: [
        '{"action":"diagnose","problem_type":"payment","reply":"vou ver"}',
        "Vejo [[FIG]] em risco. Já registrei. Seguir?",
      ],
    });
    await handleChatTurn({ channel: "telegram", externalId: "777", text: "pagamentos falham" }, deps);
    expect(recordCase).toHaveBeenCalledWith("POOL-X", "finance", expect.stringContaining("payment"));
  });

  it("diagnose on a dedup-increment (problem not new) → acknowledges the open case, NO figure, no dup case", async () => {
    const { deps, caller, recordCase } = makeDeps({
      getBinding: async () => bound,
      chatResponses: [
        '{"action":"diagnose","problem_type":"payment","reply":"vou ver"}',
        "Vejo [[FIG]] em risco. Seguir?",
      ],
    });
    caller.diagnosis.reportProblem.mockResolvedValueOnce({ problem_id: "P-1", status: "open", frequency: 2, created: false });
    const out = await handleChatTurn({ channel: "telegram", externalId: "777", text: "de novo os pagamentos" }, deps);
    expect(recordCase).not.toHaveBeenCalled(); // no duplicate learning case
    expect(out.reply.toLowerCase()).toContain("caso aberto"); // honest "already tracked"
    expect(out.reply).not.toContain("€"); // no possibly-mismatched figure
  });

  it("diagnose: model spells a money word (no digit) → guard rejects it; only the SQL € reaches the owner (§14)", async () => {
    const { deps } = makeDeps({
      getBinding: async () => bound,
      chatResponses: [
        '{"action":"diagnose","problem_type":"payment","reply":"vou ver"}',
        "Vejo oitenta euros além de [[FIG]], grave.", // spelled amount + currency word, no digit
      ],
    });
    const out = await handleChatTurn({ channel: "telegram", externalId: "777", text: "pagamentos falhando" }, deps);
    expect(out.reply).toContain("€80"); // the real figure
    expect(out.reply).not.toContain("oitenta"); // the spelled fabrication was discarded (fallback used)
  });

  it("diagnose: model repeats the [[FIG]] placeholder → guard rejects (only one code-owned figure, §14)", async () => {
    const { deps } = makeDeps({
      getBinding: async () => bound,
      chatResponses: [
        '{"action":"diagnose","problem_type":"payment","reply":"vou ver"}',
        "Risco de [[FIG]] e mais [[FIG]] amanhã.", // two placeholders ⇒ would inject the figure twice
      ],
    });
    const out = await handleChatTurn({ channel: "telegram", externalId: "777", text: "pagamentos falhando" }, deps);
    expect(out.reply).toContain("€80");
    expect(out.reply.split("€80").length - 1).toBe(1); // figure appears exactly once (deterministic fallback)
  });

  it("diagnose: model drops the figure → deterministic fallback still carries the exact € (§14)", async () => {
    const { deps } = makeDeps({
      getBinding: async () => bound,
      chatResponses: [
        '{"action":"diagnose","problem_type":"payment","reply":"vou ver"}',
        "vi um problema por aí, dá uma olhada", // narration omitted the € figure
      ],
    });
    const out = await handleChatTurn({ channel: "telegram", externalId: "777", text: "pagamentos falhando" }, deps);
    expect(out.reply).toContain("€80"); // guard caught the drop and rendered the per-restaurant figure
  });

  it("diagnose is BLOCKED for a type the engine has NO signal for (no blind guessing)", async () => {
    const { deps, caller } = makeDeps({
      getBinding: async () => bound,
      scanSignals: async () => [{ problem_type: "adoption", direction: "below" }], // only adoption has signal
      chatResponses: ['{"action":"diagnose","problem_type":"payment","reply":"vou ver pagamentos"}'],
    });
    const out = await handleChatTurn({ channel: "telegram", externalId: "777", text: "acho que é pagamento" }, deps);
    expect(caller.diagnosis.run).not.toHaveBeenCalled(); // payment has no signal → never measured
    // the model's dead-end "vou ver pagamentos" promise is replaced by an honest forward reply (anti-stall)
    expect(out.reply).toContain("adoption"); // names the signal it CAN actually measure
    expect(out.reply.toLowerCase()).not.toContain("vou ver pagamentos");
  });

  it("the engine's real signals are handed to the model in the prompt", async () => {
    const { deps, chatCalls } = makeDeps({
      getBinding: async () => bound,
      scanSignals: async () => [{ problem_type: "connection", direction: "below" }],
      chatResponses: ['{"action":"ask","reply":"oi"}'],
    });
    await handleChatTurn({ channel: "telegram", externalId: "777", text: "tá estranho" }, deps);
    expect(chatCalls[0]!.user).toContain("connection"); // the deterministic signal is in the decision prompt
  });

  it("diagnose WITHOUT a problem_type → never guesses payment (does not run the engine)", async () => {
    const { deps, caller } = makeDeps({
      getBinding: async () => bound,
      chatResponses: ['{"action":"diagnose","reply":"deixa eu entender melhor"}'], // no problem_type
    });
    const out = await handleChatTurn({ channel: "telegram", externalId: "777", text: "minhas vendas estão baixas" }, deps);
    expect(caller.diagnosis.run).not.toHaveBeenCalled(); // no payment guess fired
    expect(out.reply).toBe("deixa eu entender melhor");
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
