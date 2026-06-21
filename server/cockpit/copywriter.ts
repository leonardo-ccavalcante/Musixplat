// 02:1a copy agent. Mirrors server/knowledge/classify.ts: two providers, one shape.
//   - deterministicCopy: the §14-safe template (intro + measured line + catalog playbook). Key-free, CI-safe.
//   - llmCopy(client): OpenAI rewrites the SAME facts as a warm, restaurant-facing message — TEXT only
//     (§3.6/§8). The measured figures are the [V] numbers; the model must quote them VERBATIM, never invent
//     a number. If a required figure is dropped/altered, it THROWS so restaurantCopy fail-closes (§3.7).
// restaurantCopy degrades to deterministic on ANY error / missing key / under vitest — it NEVER throws.
import { chatText, openaiChatClient, type ChatClient } from "../_core/llm.js";

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

// Real-LLM provider (OpenAI). TEXT only. Returns the message; THROWS if a required [V] figure is missing
// (the model must not silently drop/alter a measured number, §14) ⇒ caller fail-closes to deterministic.
export function llmCopy(client: ChatClient) {
  return async (i: CopyInput): Promise<string> => {
    const user =
      `Issue we measured (use these figures verbatim): ${i.evidence}\n` +
      `Internal action (translate into plain owner-facing help, do not copy the wording): ${i.actionLabel}\n` +
      `Internal playbook (a hint for the steps, rewrite for the owner): ${i.playbook}`;
    const raw = unfence(await chatText(client, SYSTEM, user, 320));
    for (const n of i.numbers) {
      if (n && !raw.includes(n)) throw new Error(`llmCopy: dropped required figure ${n}`); // fail-closed (§14)
    }
    return raw;
  };
}

// Prod uses OpenAI when the key is present; on ANY error degrades to deterministic. Never throws (§3.7).
export async function restaurantCopy(i: CopyInput): Promise<string> {
  // Tests NEVER call the paid LLM — deterministic under vitest (hermetic, free, stable). Prod uses OpenAI.
  if (process.env.VITEST || !process.env.OPENAI_API_KEY) return deterministicCopy(i);
  try {
    return await llmCopy(await openaiChatClient())(i);
  } catch {
    return deterministicCopy(i); // degrade to deterministic, never throw to the caller
  }
}
