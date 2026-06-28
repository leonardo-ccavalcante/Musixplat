import type { Context } from "../_core/context.js";
import { redactPII } from "../pieces/pii.js";
import { parseDecision } from "./decision.js";
import { SYSTEM_PROMPT, NOT_FOUND_SYS, buildTurnUser } from "./prompt.js";

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
    }): Promise<{ problem_id: string }>;
    run(input: { problemId: string }): Promise<{
      affected: number | null;
      silent: number | null;
      revenue_lost: number | null;
      area_type: string;
      degraded: boolean;
    }>;
  };
}

export interface ChatDeps {
  chat: (system: string, user: string, maxTokens?: number) => Promise<string>;
  getBinding: (channel: string, externalId: string) => Promise<Binding | null>;
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
  const history = await deps.loadHistory(sessionId);

  const raw = await deps.chat(SYSTEM_PROMPT, buildTurnUser(history, text, binding));
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
    } else if (decision.action === "diagnose" && binding) {
      reply = await runDiagnose(deps, binding, decision.problem_type ?? "payment");
    } else {
      // ask | handoff | (diagnose while unlinked — defensive: just send what the model said)
      reply = decision.reply;
    }
  }

  await deps.appendTurn(sessionId, text, reply, binding?.tenant_id ?? null);
  return { reply, action };
}

async function runDiagnose(deps: ChatDeps, binding: Binding, problemType: string): Promise<string> {
  // Build the ctx server-side from the binding (tenant resolved at bind time from the restaurant id).
  // Slice 1 is READ-ONLY diagnosis — it moves no money, so there is no §7.3 money action to veto here.
  // (When slice 2 exposes propose/release, the financial hard-no becomes a deterministic pre-dispatch veto,
  // not a prompt instruction.)
  const ctx: Context = {
    session: { user_id: binding.user_id, tenant_id: binding.tenant_id, org_level: "team" },
    tenantId: binding.tenant_id,
    userId: binding.user_id,
  };
  const engine = deps.caller(ctx);
  // No conversationId: the agent already classified the struggle into problem_type, so this is the TYPED
  // path (no stored Conversation_Episode to blind-classify). conversation_id NULL ⇒ the orchestrator uses
  // the descriptor's area directly instead of degrading on a missing episode (the reactive path).
  const reported = await engine.diagnosis.reportProblem({
    restaurantId: binding.restaurant_id,
    problem_type: problemType,
  });
  const r = await engine.diagnosis.run({ problemId: reported.problem_id });

  // §14: the agent NEVER emits a measured number. The figures below are rendered DETERMINISTICALLY from the
  // SQL result — NO LLM in this path — so a fabricated or altered figure is structurally impossible.
  // Fail-closed: unmeasurable (degraded / null) ⇒ honest "can't measure", no number, hand to a human.
  if (r.degraded || r.affected == null || r.revenue_lost == null) {
    return "Olhei aqui, mas ainda não consigo medir isso com confiança. Vou te conectar com uma pessoa do time pra investigar junto.";
  }
  return `Já olhei o seu restaurante: ${r.affected} afetados (${r.silent} silenciosos) e cerca de ${r.revenue_lost} em risco. Quer que eu detalhe ou prefere falar com alguém do time?`;
}
