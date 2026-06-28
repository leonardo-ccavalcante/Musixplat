import { z } from "zod";

// The agent emits ONE structured decision per turn. The platform (not the model) executes the action;
// the model only chooses it. Authorization is re-checked server-side downstream — a manipulated decision
// can pick "diagnose" but the engine still resolves tenant/money itself (defence in depth, 04 §7).

// Closed set the diagnosis dispatcher routes on (the 5 builtin types). A live/unknown type is rejected
// here so the agent can't pick an unmeasurable axis in Fatia 1.
export const PROBLEM_TYPES = ["payment", "connection", "cancellation", "menu_quality", "adoption"] as const;
export type ProblemType = (typeof PROBLEM_TYPES)[number];

export const agentDecision = z.object({
  internal: z.string().default(""), // hidden chain-of-thought — logged, NEVER shown to the owner
  action: z.enum(["ask", "bind", "diagnose", "handoff"]),
  restaurant_id: z.string().trim().min(1).nullish(),
  problem_type: z.enum(PROBLEM_TYPES).nullish(),
  reply: z.string().trim().min(1),
});
export type AgentDecision = z.infer<typeof agentDecision>;

const FENCE = /```(?:json)?\s*([\s\S]*?)\s*```/i;

/** Parse the model's reply into a validated decision. Fail-closed: any shape we can't validate ⇒ null,
 *  and the caller degrades to a human handoff (never guesses an action from a malformed reply). */
export function parseDecision(text: string): AgentDecision | null {
  const fenced = FENCE.exec(text)?.[1];
  const raw = fenced ?? text;
  // Tolerate prose around the JSON: take the first '{' to the last '}'.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const r = agentDecision.safeParse(obj);
  return r.success ? r.data : null;
}
