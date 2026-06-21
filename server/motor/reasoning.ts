// 02C MOTOR-LLM reasoning seam. A MotorReasoning provider proposes ONE hypothesis: which lever (an
// action_code SQL already returned) is the worst in-range problem, plus self-confidence and bounded
// [C] text. It NEVER invents a number (§8/§14) — every value comes from the NbaVerdict that fn_nba_test
// produced; we only rank/format. The deterministic provider in server/agente/reasoning.ts is the
// change-locked floor (§3.11); this file adds a CI stub honoring a `discarded` set (falsified levers),
// so a real LLM provider can later plug into this SAME interface while CI stays deterministic.
import type { NbaVerdict, NbaReasoning, NbaSelection } from "../agente/reasoning.js";
import { labelOf, fmtValue, fmtGap } from "../../shared/signalFormat.js";

export interface MotorHypothesis {
  lever: NbaVerdict | null; // null ⇒ no confident in-range candidate ⇒ escalate (no-suppose)
  rootCause: string; // [C] bounded by the verdict, never asserts a number SQL didn't return
  confidence: number | null; // [C] self-confidence 0..1; null ⇒ escalate
  reasoning: string; // [C] narrative
}

export interface MotorReasoning {
  proposeHypothesis(input: {
    verdicts: NbaVerdict[];
    discarded: { action_code: string; reason: string }[];
    grounding: { pattern: string; outcome: string; not_resolved_reason: string | null }[];
  }): Promise<MotorHypothesis>;
}

// Relative severity so dimensions on different scales compare fairly; a zero standard ⇒ any breach is
// maximal (Infinity) and ranks WORST — never silently dropped (mirrors deterministicReasoning, §8).
const severity = (v: NbaVerdict): number =>
  v.standard === 0 ? Infinity : Math.abs(v.gap!) / Math.abs(v.standard!);

// Deterministic stub (CI): worst-relative-gap problem NOT falsified, with fixed confidence. Same
// heuristic/format as deterministicReasoning.select, but it honors the `discarded` set (§7 ≤3 learn loop).
export const stubMotorReasoning: MotorReasoning = {
  async proposeHypothesis(input): Promise<MotorHypothesis> {
    const dropped = new Set(input.discarded.map((d) => d.action_code));
    const problems = input.verdicts
      .filter(
        (v) =>
          (v.verdict === "below" || v.verdict === "above") &&
          v.standard != null &&
          v.gap != null &&
          !dropped.has(v.action_code),
      )
      .sort((a, b) => {
        const sa = severity(a);
        const sb = severity(b);
        return sa === sb ? a.action_code.localeCompare(b.action_code) : sb - sa;
      });

    const lever = problems[0] ?? null;
    if (!lever) {
      return {
        lever: null,
        rootCause: "no remaining in-range gap",
        confidence: null,
        reasoning: "all levers ok or falsified",
      };
    }
    // [C] interpretation in the signal's natural unit (rate→%, percentile, €) — no raw floats (§3.10).
    const dim = lever.dimension ?? "signal";
    const rootCause = `${labelOf(dim)} ${lever.verdict} standard — ${fmtValue(dim, lever.measured!)} vs ${fmtValue(dim, lever.standard!)} (gap ${fmtGap(dim, lever.gap!)})`;
    return { lever, rootCause, confidence: 0.9, reasoning: "stub: worst-relative-gap heuristic" };
  },
};

// Wrap a chosen lever as an NbaReasoning so the engine's NBA select path is satisfied with exactly that
// lever (the motor decided WHICH; SQL owns the NUMBER). ranked = [lever.action_code] only.
export const leverAdapter = (lever: NbaVerdict, rootCause: string): NbaReasoning => ({
  select(): NbaSelection {
    return { ranked: [lever.action_code], lever, rootCause };
  },
});
