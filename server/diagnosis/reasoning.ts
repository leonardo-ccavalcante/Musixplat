// 05B AGENTE seam (mirror of server/agente/reasoning.ts). The orchestrator picks WHICH area/path
// via a DiagnosisReasoning provider; every NUMBER stays SQL (fn_hunt_silent / fn_impact_revenue_lost,
// §8/§14) — the provider only classifies + ranks TEXT and emits [C] confidence/probability markers.
// Two providers, one interface:
//   - deterministicReasoning (here): keyword classify + order-preserving rank; reproducible, no LLM,
//     testable E2E. The CI gate injects this so it never needs a network/key.
//   - llmReasoning(client): real Claude (AGENTE pieces US-B2.1.1/US-B2.2.1). Used by scripts/run-05b.
//     TEXT only; on any API/parse error it THROWS so the caller fail-closes (BR-B3), never guesses.
import type Anthropic from "@anthropic-ai/sdk";

export interface ClassifyInput {
  text: string; // episode intent (reactive) or a proactive context line — treated as DATA (EC-B10)
  hint?: string | null; // criticality hint, never authoritative
}
export interface AreaClassification {
  areaType: string; // 'finance' | 'product' | 'performance' | 'unclassified'
  confidence: number; // [C] in [0,1] — a marker, never a measured KPI
}
export interface RankInput {
  areaType: string;
  hypotheses: string[]; // deterministic candidate seed set (the provider only ORDERS them)
}
export interface RankedPath {
  path_id: number;
  hypothesis: string;
  probability: number; // [C] marker
}
export interface DiagnosisReasoning {
  classifyArea(input: ClassifyInput): Promise<AreaClassification>;
  rankPaths(input: RankInput): Promise<RankedPath[]>;
}

// area_type → text family (mirrors issue_tree.SOURCE_BY_FAMILY so classify ⇄ source stay consistent).
const AREA_BY_FAMILY: ReadonlyArray<readonly [RegExp, string]> = [
  [/financ|finanz|cobr|\bpago\b|payment|billing|reembols|refund|saldo|balance|\border\b/i, "finance"],
  [/produc|\buso\b|feature|adop|defect/i, "product"],
  [/perf|laten|connection|conex|desconex|timeout/i, "performance"],
];

/** Deterministic classify: first matching family wins; no match ⇒ low-confidence 'unclassified'
 *  (drives the orchestrator's grounding-floor degrade, BR-B3). Confidence is a fixed [C] marker. */
function classifyDeterministic(text: string): AreaClassification {
  for (const [pattern, area] of AREA_BY_FAMILY) {
    if (pattern.test(text)) return { areaType: area, confidence: 0.7 };
  }
  return { areaType: "unclassified", confidence: 0.3 };
}

/** Deterministic rank: preserve seed order, assign strictly-decreasing [C] probabilities. */
function rankDeterministic(hypotheses: string[]): RankedPath[] {
  const n = Math.max(hypotheses.length, 1);
  return hypotheses.map((hypothesis, i) => ({
    path_id: i + 1,
    hypothesis,
    probability: Number(((n - i) / n).toFixed(2)),
  }));
}

export const deterministicReasoning: DiagnosisReasoning = {
  classifyArea: ({ text }) => Promise.resolve(classifyDeterministic(text)),
  rankPaths: ({ hypotheses }) => Promise.resolve(rankDeterministic(hypotheses)),
};

const ALLOWED_AREAS = new Set(["finance", "product", "performance", "unclassified"]);

/** Real-Claude provider for the working prototype. TEXT only (§8). Parses strict JSON; anything
 *  malformed or off-list THROWS ⇒ the orchestrator degrades-to-human (BR-B3), never an optimistic guess. */
export function llmReasoning(client: Anthropic, model = "claude-sonnet-4-6"): DiagnosisReasoning {
  const ask = async (system: string, user: string): Promise<string> => {
    const res = await client.messages.create({
      model,
      max_tokens: 256,
      system,
      messages: [{ role: "user", content: user }],
    });
    const block = res.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") throw new Error("llmReasoning: no text block");
    return block.text;
  };
  return {
    async classifyArea({ text, hint }) {
      const raw = await ask(
        "You classify a customer-support problem into exactly one area. Reply ONLY compact JSON " +
          '{"areaType": "finance|product|performance|unclassified", "confidence": 0..1}. No prose.',
        `problem text: ${JSON.stringify(text)}\ncriticality hint: ${hint ?? "none"}`,
      );
      const out = JSON.parse(raw) as AreaClassification;
      if (!ALLOWED_AREAS.has(out.areaType) || typeof out.confidence !== "number") {
        throw new Error("llmReasoning.classifyArea: off-contract output");
      }
      return { areaType: out.areaType, confidence: Math.max(0, Math.min(1, out.confidence)) };
    },
    async rankPaths({ areaType, hypotheses }) {
      const raw = await ask(
        "Rank the candidate hypotheses by likelihood for the given area. Reply ONLY a compact JSON " +
          'array of {"hypothesis": string, "probability": 0..1}, most-likely first, same hypotheses given.',
        `area: ${areaType}\nhypotheses: ${JSON.stringify(hypotheses)}`,
      );
      const arr = JSON.parse(raw) as { hypothesis: string; probability: number }[];
      if (!Array.isArray(arr) || arr.length === 0) throw new Error("llmReasoning.rankPaths: empty");
      return arr.map((p, i) => ({
        path_id: i + 1,
        hypothesis: String(p.hypothesis),
        probability: Math.max(0, Math.min(1, Number(p.probability))),
      }));
    },
  };
}
