// P06 doc-type classifier. Mirrors server/diagnosis/reasoning.ts: two providers, one shape.
//   - deterministicClassify: keyword rules → conservative 'Other' on no signal; key-free, CI-safe.
//   - llmClassify(client): real Claude proposes ONE type from the closed MECE list; TEXT only (§3.6),
//     never a number. Off-list / malformed ⇒ THROWS so classifyDocType fail-closes to deterministic.
// classifyDocType degrades to deterministic on ANY LLM error — it NEVER throws to the caller (§3.7).
import { chatText, openaiChatClient, type ChatClient, type TokenUsage } from "../_core/llm.js";

// Optional sink: the live classifier reports its chat token usage so the caller (ingestDocument) can
// log cost-per-process (P07). The deterministic path is free and never calls it ⇒ tests stay silent.
export type ClassifyUsageSink = (usage: TokenUsage) => void;

// Closed MECE taxonomy (matches public.kb_doc_type SQL enum + docType Zod contract).
export const DOC_TYPES = ["Policy", "Context", "FAQ", "Terms", "Runbook", "Other"] as const;
export type DocType = (typeof DOC_TYPES)[number];
export interface DocClassification {
  docType: DocType;
  confidence: number; // [C] marker in [0,1] — never a measured KPI
}

// Ordered keyword rules; first match wins. 'Other' is the conservative no-signal default.
const RULES: ReadonlyArray<readonly [DocType, RegExp]> = [
  ["Policy", /\b(policy|policies|refund|cancellation|compliance|governs?|must not|prohibit)\b/i],
  ["Terms", /\b(terms|conditions|t&c|agreement|liability|warranty)\b/i],
  ["FAQ", /\b(faq|frequently asked|q:|how do i|common questions)\b/i],
  ["Runbook", /\b(runbook|step \d|procedure|escalat|on-call|playbook)\b/i],
  ["Context", /\b(about us|company|background|overview|context|mission)\b/i],
];

/** Deterministic classify: first matching rule wins; no signal ⇒ conservative 'Other' (§3.7 fail-closed). */
export function deterministicClassify(text: string): DocClassification {
  for (const [type, re] of RULES) {
    if (re.test(text)) return { docType: type, confidence: 0.7 };
  }
  return { docType: "Other", confidence: 0.3 };
}

const isDocType = (v: unknown): v is DocType => DOC_TYPES.includes(v as DocType);

/** Real models often fence JSON despite the "ONLY JSON" instruction; strip it before parsing. */
const unfence = (s: string): string =>
  s.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

/** Real-LLM provider (OpenAI). TEXT only (§3.6). Off-list or malformed output THROWS ⇒ caller fail-closes. */
export function llmClassify(client: ChatClient, onUsage?: ClassifyUsageSink) {
  const system =
    `Classify a company document into EXACTLY one of: ${DOC_TYPES.join(", ")}. ` +
    'Reply ONLY compact JSON {"docType":"...","confidence":0..1}. No prose.';
  return async (text: string): Promise<DocClassification> => {
    const { text: raw, usage } = await chatText(client, system, text.slice(0, 6000), 64);
    onUsage?.(usage);
    const out = JSON.parse(unfence(raw)) as { docType: unknown; confidence: unknown };
    if (!isDocType(out.docType) || typeof out.confidence !== "number") {
      throw new Error("llmClassify: off-contract output"); // fail-closed, no guess
    }
    return { docType: out.docType, confidence: Math.max(0, Math.min(1, out.confidence)) };
  };
}

/** Prod uses OpenAI when the key is present; on ANY error degrades to deterministic. Never throws (§3.7). */
export async function classifyDocType(
  text: string,
  onUsage?: ClassifyUsageSink,
): Promise<DocClassification> {
  // Tests NEVER call the paid LLM — deterministic under vitest (hermetic, free, stable). Prod uses OpenAI.
  if (process.env.VITEST || !process.env.OPENAI_API_KEY) return deterministicClassify(text);
  try {
    return await llmClassify(await openaiChatClient(), onUsage)(text);
  } catch {
    return deterministicClassify(text); // degrade to deterministic, never throw to the caller
  }
}
