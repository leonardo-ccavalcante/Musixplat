// P06 doc-type classifier. Mirrors server/diagnosis/reasoning.ts: two providers, one shape.
//   - deterministicClassify: keyword rules → conservative 'Other' on no signal; key-free, CI-safe.
//   - llmClassify(client): real Claude proposes ONE type from the closed MECE list; TEXT only (§3.6),
//     never a number. Off-list / malformed ⇒ THROWS so classifyDocType fail-closes to deterministic.
// classifyDocType degrades to deterministic on ANY LLM error — it NEVER throws to the caller (§3.7).
import type Anthropic from "@anthropic-ai/sdk";

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

/** Real-Claude provider. TEXT only (§3.6). Off-list or malformed output THROWS ⇒ caller fail-closes. */
export function llmClassify(client: Anthropic, model = "claude-sonnet-4-6") {
  return async (text: string): Promise<DocClassification> => {
    const res = await client.messages.create({
      model,
      max_tokens: 64,
      system:
        `Classify a company document into EXACTLY one of: ${DOC_TYPES.join(", ")}. ` +
        'Reply ONLY compact JSON {"docType":"...","confidence":0..1}. No prose.',
      messages: [{ role: "user", content: text.slice(0, 6000) }],
    });
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") throw new Error("llmClassify: no text block");
    const out = JSON.parse(unfence(block.text)) as { docType: unknown; confidence: unknown };
    if (!isDocType(out.docType) || typeof out.confidence !== "number") {
      throw new Error("llmClassify: off-contract output"); // fail-closed, no guess
    }
    return { docType: out.docType, confidence: Math.max(0, Math.min(1, out.confidence)) };
  };
}

/** Prod uses Claude when the key is present; on ANY error degrades to deterministic. Never throws (§3.7). */
export async function classifyDocType(text: string): Promise<DocClassification> {
  if (!process.env.ANTHROPIC_API_KEY) return deterministicClassify(text);
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    return await llmClassify(new Anthropic())(text);
  } catch {
    return deterministicClassify(text); // degrade to deterministic, never throw to the caller
  }
}
