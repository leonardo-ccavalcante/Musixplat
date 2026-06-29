import type { Context } from "../_core/context.js";
import { redactPII } from "../pieces/pii.js";
import { parseDecision } from "./decision.js";
import {
  SYSTEM_PROMPT,
  NOT_FOUND_SYS,
  NARRATE_OWNER_SYS,
  NARRATE_OWNER_NOMONEY_SYS,
  ROUTE_PLAN,
  buildTurnUser,
  buildOwnerNarrateUser,
  buildOwnerNarrateNoMoneyUser,
} from "./prompt.js";

// Owner-facing currency rendering — code-owned, NEVER the LLM (§14). e.g. 472111.2 -> "€472,111".
function euro(n: number): string {
  return `€${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// §14 narration guard: the model must contribute NO figure of its own. Reject any digit AND any currency
// word (a spelled-out amount almost always carries one), so a fabricated amount can't ride alongside the
// one code-injected figure. The real number only ever appears where CODE puts it.
const CURRENCY_WORD = /\b(euros?|eur|reais|real|d[óo]lar(es)?|dollars?|libras?|pounds?)\b/i;
function modelWroteNoFigure(textWithoutFig: string): boolean {
  return !/\d/.test(textWithoutFig) && !CURRENCY_WORD.test(textWithoutFig);
}

// Async-stalling detector (PT/ES/IT/EN). The platform is SYNCHRONOUS — there is no background job — so the
// agent must NEVER promise to "analyze and report back / one moment / I'll let you know". This is a CODE
// guarantee (not a prompt hope): a stalling reply is replaced with an honest, forward-moving one.
const STALL =
  /\b(um|un)\s+momento\b|\baguard\w*\b|\bvou\s+(verificar|analisar|olhar|ver|checar)\b|\b(estou|estarei)\s+analisando\b|\banalis(ando|arei|aremos)\b|\bte\s+aviso\b|\bem\s+breve\b|\bj[áa]\s+(te\s+)?retorno\b|\bone\s+moment\b|\bin\s+a\s+(moment|sec)\b|\bi'?ll\s+(let\s+you\s+know|get\s+back|check|look)\b|\b(checking|analyzing)\b|\bun\s+attimo\b|\bsto\s+analizzando\b|\bvoy\s+a\s+(revisar|analizar)\b|\bestoy\s+analizando\b|\bd[ée]jame\s+revisar\b|\ben\s+un\s+momento\b/i;

/** Replace any async-stalling reply with an honest, immediate, forward-moving one driven by the signals. */
function antiStall(reply: string, signals: { problem_type: string }[]): string {
  if (reply.includes("€")) return reply; // a code-injected figure is a real synchronous result, not a stall
  if (!STALL.test(reply)) return reply;
  if (signals.length) {
    const types = signals.map((s) => s.problem_type).join(", ");
    return `Eu não faço análise "pra depois" — olho na hora. Agora consigo medir: ${types}. Quer que eu veja algum desses pra você?`;
  }
  return `Eu não faço análise "pra depois" — olho na hora. Agora não estou medindo nenhum problema no seu restaurante. Me conta o que mudou que eu olho já.`;
}

// The channel-agnostic agent loop. ONE turn: redact PII -> decide (LLM) -> execute the chosen action by
// reusing the existing engine procedures via the injected caller -> narrate honestly. All side-effects are
// injected (deps) so the loop is unit-testable with no DB/LLM/network. The platform owns authorization:
// the caller's ctx.tenantId is set from the server-resolved binding, never from the channel payload (§7).

export interface Binding {
  channel: string;
  external_id: string;
  restaurant_id: string;
  tenant_id: string;
  user_id: string;
}

export interface Turn {
  role: "human" | "ai";
  content: string;
}

// Minimal slice of the engine the loop needs — adapted from appRouter.createCaller(ctx) in the gateway,
// so this module never imports tRPC types. run returns only the fields the narration uses.
export interface EngineCaller {
  diagnosis: {
    reportProblem(input: {
      restaurantId: string;
      problem_type: string;
      conversationId?: string;
    }): Promise<{ problem_id: string; created: boolean }>;
    run(input: { problemId: string }): Promise<{
      affected: number | null;
      silent: number | null;
      revenue_lost: number | null;
      area_type: string;
      degraded: boolean;
      route: string;
    }>;
  };
}

export interface ChatDeps {
  chat: (system: string, user: string, maxTokens?: number) => Promise<string>;
  getBinding: (channel: string, externalId: string) => Promise<Binding | null>;
  scanSignals: (restaurantId: string) => Promise<{ problem_type: string; direction: string }[]>;
  restaurantAtRisk: (restaurantId: string, problemType: string) => Promise<number>;
  recordCase: (tenantId: string, areaType: string, pattern: string) => Promise<void>;
  resolveRestaurant: (restaurantId: string) => Promise<{ tenantId: string; userId: string } | null>;
  upsertBinding: (b: Binding) => Promise<void>;
  loadHistory: (sessionId: string) => Promise<Turn[]>;
  appendTurn: (sessionId: string, human: string, ai: string, tenantId: string | null) => Promise<void>;
  caller: (ctx: Context) => EngineCaller;
}

export interface ChatInput {
  channel: string;
  externalId: string;
  text: string;
}

// Fail-closed reply when the model output can't be parsed or the turn throws: never guess, hand to a human.
const HANDOFF_FALLBACK =
  "Tive uma dificuldade aqui - já estou chamando uma pessoa do time pra te ajudar.";
// Fail-closed reply when the redactor's independent net still flags possible PII (must not persist/forward).
const PII_WITHHELD =
  "Por segurança, prefiro não seguir com dados sensíveis por aqui - já estou te conectando com uma pessoa do time.";

export async function handleChatTurn(
  input: ChatInput,
  deps: ChatDeps,
): Promise<{ reply: string; action: string }> {
  // Conversation memory key is composite — Telegram "123" and Intercom "123" must NEVER share history.
  const sessionId = `${input.channel}:${input.externalId}`;

  // §3.7/BR-A2: the owner's text is DATA. Redact PII first; if the INDEPENDENT residual net still flags
  // possible PII (a detector blind spot), fail-closed: never send it to the LLM, never persist it — store a
  // placeholder and hand to a human. (redactPII's contract: residualPII ⇒ caller MUST NOT persist.)
  const red = redactPII(input.text);
  if (red.residualPII) {
    await deps.appendTurn(sessionId, "[withheld: possible sensitive data]", PII_WITHHELD, null);
    return { reply: PII_WITHHELD, action: "handoff" };
  }
  const text = red.texto;
  const binding = await deps.getBinding(input.channel, input.externalId);
  // The engine's deterministic ground truth: which problem types actually have signal for this restaurant.
  // The agent may only diagnose WITHIN this set — no blind guessing.
  const signals = binding ? await deps.scanSignals(binding.restaurant_id) : [];
  const signalTypes = new Set(signals.map((s) => s.problem_type));
  const history = await deps.loadHistory(sessionId);

  const raw = await deps.chat(SYSTEM_PROMPT, buildTurnUser(history, text, binding, signals));
  const decision = parseDecision(raw);

  let reply: string;
  let action: string;

  if (!decision) {
    action = "handoff";
    reply = HANDOFF_FALLBACK;
  } else {
    action = decision.action;
    if (decision.action === "bind") {
      const rid = decision.restaurant_id?.trim();
      const resolved = rid ? await deps.resolveRestaurant(rid) : null;
      if (rid && resolved) {
        await deps.upsertBinding({
          channel: input.channel,
          external_id: input.externalId,
          restaurant_id: rid,
          tenant_id: resolved.tenantId,
          user_id: resolved.userId,
        });
        reply = decision.reply;
      } else {
        // Unknown id: never confirm a link, never leak — a grounded "couldn't find it" in the owner's language.
        reply = await deps.chat(NOT_FOUND_SYS, `Owner said: ${text}\nUnknown id: ${rid ?? "(none)"}`);
      }
    } else if (
      decision.action === "diagnose" &&
      binding &&
      decision.problem_type &&
      signalTypes.has(decision.problem_type)
    ) {
      reply = await runDiagnose(deps, binding, decision.problem_type, text);
    } else {
      // ask | handoff | diagnose-without-a-type (never guess payment) | diagnose a type the engine has NO
      // signal for (never run a no-signal diagnosis) | diagnose-while-unlinked. Send what the model said.
      reply = decision.reply;
    }
  }

  // STRUCTURAL guarantee (not a prompt hope): no async-stalling reply ever reaches the owner.
  reply = antiStall(reply, signals);

  await deps.appendTurn(sessionId, text, reply, binding?.tenant_id ?? null);
  return { reply, action };
}

async function runDiagnose(
  deps: ChatDeps,
  binding: Binding,
  problemType: string,
  ownerText: string,
): Promise<string> {
  // Build the ctx server-side from the binding (tenant resolved at bind time from the restaurant id).
  const ctx: Context = {
    session: { user_id: binding.user_id, tenant_id: binding.tenant_id, org_level: "team" },
    tenantId: binding.tenant_id,
    userId: binding.user_id,
  };
  const engine = deps.caller(ctx);
  // reportProblem creates the TRACKED ticket (the Diagnosed_Problem shown on /diagnosis). run produces the
  // numbers AND fires the close-loop that RESOLVES what's safe (non-money, in-range) and escalates the rest —
  // money never auto-acts (§7, enforced in the engine). No conversationId ⇒ the TYPED path (the agent already
  // classified the struggle), so the orchestrator uses the descriptor's area instead of degrading.
  const reported = await engine.diagnosis.reportProblem({
    restaurantId: binding.restaurant_id,
    problem_type: problemType,
  });
  const r = await engine.diagnosis.run({ problemId: reported.problem_id });

  // The conversation becomes a Knowledge_Case (reviewed=false, outcome NULL) — the chat's learning
  // contribution: it enters the human RLHF queue and, once reviewed, grounds future diagnoses (BR-B3).
  // Only on a NEW problem (not a dedup-increment) so a chatty owner doesn't spam cases. Best-effort:
  // a learning-write failure must never break the owner's reply.
  if (reported.created) {
    await deps
      .recordCase(binding.tenant_id, r.area_type, `chat: ${ownerText} → ${problemType}`)
      .catch(() => undefined);
  } else {
    // A case for this restaurant is already open (reportProblem dedups on tenant+restaurant and KEEPS the
    // existing type). The requested type may differ, so narrating an at-risk figure here could mismatch the
    // diagnosed problem — instead, honestly acknowledge it's already tracked. No (possibly-wrong) number.
    return "Já tem um caso aberto pro seu restaurante e estou acompanhando. Quer uma atualização ou prefere falar com alguém do time?";
  }

  // Unmeasurable → honest, still TRACKED (the ticket exists), a person follows up. No number invented (§14).
  if (r.degraded || r.affected == null || r.revenue_lost == null) {
    return "Olhei aqui, mas ainda não consigo medir isso com confiança. Já registrei pra acompanhar e vou trazer uma pessoa do time pra investigar com você.";
  }

  const planHint = ROUTE_PLAN[r.route] ?? "it's being looked into by the team";
  // The owner-honest figure is THIS restaurant's OWN at-risk € (NOT the pool-wide revenue_lost, which is far
  // too high for one restaurant). 0 ⇒ a non-money type (connection/menu_quality/adoption) ⇒ show NO number.
  const atRisk = await deps.restaurantAtRisk(binding.restaurant_id, problemType);

  if (atRisk <= 0) {
    // No honest per-restaurant money figure: narrate the finding + plan with NO number/currency at all.
    const narration = await deps.chat(
      NARRATE_OWNER_NOMONEY_SYS,
      buildOwnerNarrateNoMoneyUser(ownerText, problemType, planHint),
    );
    if (!narration.includes("[[FIG]]") && modelWroteNoFigure(narration)) return narration;
    return `Encontrei um ponto em ${problemType} que dá pra melhorar no seu restaurante. Já registrei pra acompanhar e estou cuidando disso. Quer que eu detalhe?`;
  }

  // §14 STRICT: the LLM NEVER writes a figure. It frames the reply in the owner's language and marks where
  // the amount goes with EXACTLY ONE [[FIG]] token; CODE injects the only number (euro(), per-restaurant from
  // SQL). Reject if the placeholder count isn't 1, or the model wrote any digit/currency word ⇒ fallback.
  const euroStr = euro(atRisk);
  const narration = await deps.chat(NARRATE_OWNER_SYS, buildOwnerNarrateUser(ownerText, planHint));
  const FIG = "[[FIG]]";
  const figCount = narration.split(FIG).length - 1;
  if (figCount === 1 && modelWroteNoFigure(narration.split(FIG).join(" "))) {
    return narration.split(FIG).join(euroStr);
  }
  // Fallback (no/again-too-many placeholders, or the model tried to write its own figure) — deterministic.
  return `Pelo que vi, há cerca de ${euroStr} em risco no seu restaurante. Já registrei pra acompanhar e estou cuidando disso. Quer que eu detalhe?`;
}
