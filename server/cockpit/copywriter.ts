// 02:1a copy agent. Mirrors server/knowledge/classify.ts: two providers, one shape.
//   - deterministicCopy: the §14-safe template (intro + measured line + catalog playbook). Key-free, CI-safe.
//   - llmCopy(client): OpenAI rewrites the SAME facts as a warm, restaurant-facing message — TEXT only
//     (§3.6/§8). The measured figures are the [V] numbers; the model must quote them VERBATIM, never invent
//     a number. If a required figure is dropped/altered, it THROWS so restaurantCopy fail-closes (§3.7).
// restaurantCopy degrades to deterministic on ANY error / missing key / under vitest — it NEVER throws.
import { chatText, openaiChatClient, CHAT_MODEL, type ChatClient, type TokenUsage } from "../_core/llm.js";
import { getActiveChatModel } from "../_core/model.js";
import { recordUsageSafe } from "../_core/usage.js";

export interface CopyInput {
  actionLabel: string; // internal action name (e.g. "Investigate fraud/risk") — context for the model, not shown verbatim
  cohortId: string;
  evidence: string; // the [V] measured line ("Customer-cancel rate 8.3% vs 5% standard · gap +3.3 pts")
  playbook: string; // internal next-steps reference (the model translates it, never copies the jargon)
  numbers: string[]; // the [V] figures that MUST survive into the copy (e.g. ["8.3%", "5%"])
}

// The deterministic, §14-safe message (operator-internal voice). Unchanged behaviour = CI stays green.
export function deterministicCopy(i: CopyInput): string {
  return [
    `Re: ${i.actionLabel} — cohort ${i.cohortId}.`,
    "",
    `What we measured: ${i.evidence}.`,
    "",
    "Recommended next steps:",
    i.playbook,
  ].join("\n");
}

// Strip a ```fence the model may add despite "no markdown".
const unfence = (s: string): string => s.trim().replace(/^```(?:\w+)?\s*/i, "").replace(/\s*```$/i, "").trim();

// The restaurant is the AUDIENCE. Warm, honest, blame-free, jargon-free; a short step-by-step that delivers
// value; the 4 Agreements as the tone (impeccable word · not personal · no assumptions · do your best).
const SYSTEM =
  "You write a short message from the Uber Eats partner-support team TO a restaurant owner. " +
  "Audience: a busy owner, not technical. Goal: they understand ONE issue and exactly what to do to improve, " +
  "feeling supported. Voice (the Four Agreements): be impeccable and honest with your words; never blame or " +
  "make it personal; assume good intent, never accuse; encourage their best effort. Rules: plain language, NO " +
  "internal jargon (never the words fraud, cohort, NBA, autonomy, escalate, standard-deviation); lead with one " +
  "warm line naming what we noticed (include the figures); then 2-4 short, concrete numbered steps they can act " +
  "on; end with one encouraging line. Under 110 words. Quote the given figures EXACTLY; never invent a number. " +
  "Output ONLY the message text — no preamble, no markdown.";

// Optional sink: the provider reports the call's token usage so the caller (which has the tenant + nba
// context) logs cost-per-decision (P07 "custo da atención"). Auto-gated — the deterministic path never fires it.
export type CopyUsageSink = (usage: TokenUsage, model: string) => void;

// Real-LLM provider (OpenAI). TEXT only. Returns the message; THROWS if a required [V] figure is missing
// (the model must not silently drop/alter a measured number, §14) ⇒ caller fail-closes to deterministic.
export function llmCopy(client: ChatClient, model: string = CHAT_MODEL, onUsage?: CopyUsageSink) {
  return async (i: CopyInput): Promise<string> => {
    const user =
      `Issue we measured (use these figures verbatim): ${i.evidence}\n` +
      `Internal action (translate into plain owner-facing help, do not copy the wording): ${i.actionLabel}\n` +
      `Internal playbook (a hint for the steps, rewrite for the owner): ${i.playbook}`;
    const { text, usage } = await chatText(client, SYSTEM, user, 320, model);
    onUsage?.(usage, model); // surface cost before the figure-guard — the tokens were spent regardless
    const raw = unfence(text);
    for (const n of i.numbers) {
      if (n && !raw.includes(n)) throw new Error(`llmCopy: dropped required figure ${n}`); // fail-closed (§14)
    }
    return raw;
  };
}

// Prod uses OpenAI when the key is present; on ANY error degrades to deterministic. Never throws (§3.7).
// usageCtx (tenant + the nba_id) lets the live path log its token cost (P07); omit it ⇒ nothing logged.
export async function restaurantCopy(
  i: CopyInput,
  usageCtx?: { tenantId: string; refId?: string | null },
): Promise<string> {
  // Tests NEVER call the paid LLM — deterministic under vitest (hermetic, free, stable). Prod uses OpenAI.
  if (process.env.VITEST || !process.env.OPENAI_API_KEY) return deterministicCopy(i);
  let model = CHAT_MODEL;
  let spent: TokenUsage | undefined; // captured by the sink right after chatText, BEFORE the figure-guard can throw
  try {
    model = await getActiveChatModel(); // the operator-selected chat model (§3.8 by name)
    return await llmCopy(await openaiChatClient(), model, (usage) => (spent = usage))(i);
  } catch {
    return deterministicCopy(i); // degrade to deterministic, never throw to the caller (§3.7)
  } finally {
    // Log the spent tokens whether the copy SUCCEEDED or the figure-guard REJECTED it (Codex P1): the LLM
    // call happened, so the cost is real — "custo da atención" counts wasted attention too (§3.6). Best-effort.
    if (usageCtx && spent) {
      await recordUsageSafe({
        tenantId: usageCtx.tenantId,
        processType: "cockpit",
        kind: "chat",
        model,
        refId: usageCtx.refId ?? i.cohortId,
        usage: spent,
      });
    }
  }
}
